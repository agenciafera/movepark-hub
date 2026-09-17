// O estorno como o E0.3.5 decidiu: sai 100% do master quando a cobrança foi ao gateway com split,
// e a perna do parceiro vira dívida no razão. Cinco lugares estornam (cancel-booking, o "pago sem
// vaga" do webhook e do reconcile-confirmations, delete-account, change-booking-dates-paid) e os
// cinco passam por aqui, para a regra existir uma vez.
//
// Também classifica a recusa do gateway, porque o cancelamento reage diferente: recusa definitiva
// (prazo vencido, sem saldo) vai para a fila de reembolso manual; recusa incerta (rede, 5xx, rate
// limit) aborta e pede para tentar de novo, porque aí tentar de novo funciona.

import type { PaymentGateway, RecipientBalance, RefundResult, SplitRule } from "./types.ts";
import { partnerRule, refundSplitHybrid, refundSplitToMaster } from "./split.ts";
import { totalGatewayFeeCents } from "./fees.ts";

/** O que o helper precisa saber da linha de `payment`. */
export interface RefundablePayment {
  split: SplitRule[] | null | undefined;
  split_sent_to_gateway: boolean | null | undefined;
  debt_recovered_cents?: number | null;
  /** Taxa do gateway apurada em `GET /payables` (reconcile-gateway-fees). Nulo = ainda não apurada. */
  gateway_fee_cents?: number | null;
}

/**
 * A cobrança foi capturada COM split no gateway? Só nesse caso o estorno pode (e deve) levar a
 * regra do master. Cobrança em custódia, ou com o parceiro zerado pelo abatimento, foi sem `split`,
 * e mandar regra nela é recusado ("apenas cobranças capturadas com Split...").
 */
export function chargeWentWithSplit(p: RefundablePayment): boolean {
  if (p.split_sent_to_gateway !== true) return false;
  const partner = partnerRule(p.split ?? []);
  if (!partner || !partner.recipientId) return false;
  return partner.amount - Math.max(0, p.debt_recovered_cents ?? 0) > 0;
}

/**
 * A Movepark absorve este estorno? Sempre que a venda foi no modo split: o parceiro recebeu (ou
 * teve a perna abatida em dívida, que dá no mesmo para o razão). É o que o banco grava em
 * `payment.refund_absorbed_by_master`.
 */
export function refundAbsorbedByMaster(p: RefundablePayment): boolean {
  return p.split_sent_to_gateway === true;
}

/** Regras que vão no estorno, ou `undefined` para deixar o gateway seguir a captura. */
export function refundSplitFor(
  p: RefundablePayment,
  moveparkRecipientId: string,
  amountCents: number,
): SplitRule[] | undefined {
  if (!chargeWentWithSplit(p)) return undefined;
  return refundSplitToMaster(moveparkRecipientId, amountCents);
}

/**
 * Num chargeback, quem o gateway debitou? Com `liable` na perna da Movepark (split novo), o master;
 * o parceiro ficou intacto e a perna dele entra na dívida. Split antigo (`liable` no parceiro) o
 * gateway já debitou o parceiro: nada a cobrar. Custódia: não houve split, o master pagou, e o
 * parceiro não tinha recebido nada, então também não é dívida.
 */
export function chargebackAbsorbedByMaster(p: RefundablePayment): boolean {
  if (p.split_sent_to_gateway !== true) return false;
  const rules = p.split ?? [];
  const movepark = rules.find((r) => (r.role ? r.role === "movepark" : !r.liable));
  return movepark?.liable === true;
}

export type RefundOutcome = "ok" | "definitive" | "transient";

/**
 * Como tratar a resposta do gateway. 408/409/429 e 5xx são "não sei": tentar de novo pode
 * funcionar. Os outros 4xx são recusa processada: prazo vencido, saldo insuficiente, cobrança em
 * estado final. Insistir não muda nada, e o cliente precisa da devolução por outro caminho.
 */
export function classifyRefundOutcome(
  httpStatus: number | null | undefined,
  status?: RefundResult["status"] | null,
): RefundOutcome {
  const s = httpStatus ?? 0;
  // 200 com a transação de cancelamento `failed` é recusa processada (saldo insuficiente, prazo):
  // insistir não muda nada, e o cliente precisa cair na fila manual, não em "pendente".
  if (s >= 200 && s < 300) return status === "failed" ? "definitive" : "ok";
  if (s === 408 || s === 409 || s === 429) return "transient";
  if (s >= 400 && s < 500) return "definitive";
  return "transient";
}

export type ManualRefundReason = "gateway_deadline" | "gateway_no_balance" | "gateway_refused";

/** Motivo da fila manual, lido da resposta crua do gateway. Sem certeza, `gateway_refused`. */
export function manualRefundReason(raw: unknown): ManualRefundReason {
  const texto = JSON.stringify(raw ?? "").toLowerCase();
  if (/(prazo|deadline|expired|dias|days|limit.*time|period)/.test(texto)) return "gateway_deadline";
  if (/(saldo|balance|insufficient|funds)/.test(texto)) return "gateway_no_balance";
  return "gateway_refused";
}

// ── Estorno híbrido (E0.3.6) ─────────────────────────────────────────────────
//
// Quando o recebedor do parceiro tem saldo DISPONÍVEL que cobre o líquido que ele recebeu naquela
// venda, o estorno vai com duas regras e o gateway debita o parceiro: a dívida nem nasce. Qualquer
// dúvida (chave desligada, taxa não apurada, saldo curto, leitura ruim, recebedor sumido) cai no
// 100% master, que é o comportamento de antes. Spec: docs/specs/estorno-hibrido.md.

export type RefundMode = "partner" | "master" | "none";

export interface RefundDecision {
  mode: RefundMode;
  /** Regras a enviar, ou `undefined` para o gateway seguir a captura (cobrança sem split). */
  rules: SplitRule[] | undefined;
  /** Quanto o gateway debita do parceiro (zero fora do modo `partner`). */
  partnerCents: number;
  /** Saldo disponível lido na decisão, ou null quando não houve leitura boa. */
  partnerBalanceCents: number | null;
  /** Por que não foi `partner`, para o log. */
  reason: string;
}

export interface RefundDecisionInput {
  payment: RefundablePayment;
  moveparkRecipientId: string;
  /** Valor estornado (parcial ou total). */
  amountCents: number;
  /** Valor total da cobrança. */
  totalCents: number;
  hybridEnabled: boolean;
  /** Leitura ao vivo do saldo do recebedor do parceiro; null se não foi lida. */
  balance: Pick<RecipientBalance, "availableCents" | "httpStatus"> | null;
  /** O recebedor está marcado como inexistente no gateway (`gateway_missing_at`)? */
  recipientMissing?: boolean;
}

/**
 * Quanto o parceiro devolveria neste estorno: a parte dele (líquida do abatimento de dívida)
 * proporcional ao valor estornado, menos a taxa de processamento que ele pagou na captura, também
 * proporcional. Arredonda para baixo, para nunca pedir um centavo a mais do que ele recebeu.
 */
export function partnerRefundCents(
  p: RefundablePayment,
  amountCents: number,
  totalCents: number,
): number | null {
  const partner = partnerRule(p.split ?? []);
  if (!partner || totalCents <= 0) return null;
  const legCents = partner.amount - Math.max(0, p.debt_recovered_cents ?? 0);
  if (legCents <= 0) return 0;
  if (p.gateway_fee_cents == null) return null; // taxa não apurada: não dá para saber o líquido
  const fee = partner.chargeProcessingFee ? Math.max(0, p.gateway_fee_cents) : 0;
  const gross = Math.floor((legCents * amountCents) / totalCents);
  const feePart = Math.floor((fee * amountCents) / totalCents);
  return Math.max(0, gross - feePart);
}

/** A decisão, pura: nada de rede aqui, para a tabela da spec caber em teste. */
export function decideRefundSplit(i: RefundDecisionInput): RefundDecision {
  const master = (reason: string, balance: number | null = null): RefundDecision => ({
    mode: chargeWentWithSplit(i.payment) ? "master" : "none",
    rules: refundSplitFor(i.payment, i.moveparkRecipientId, i.amountCents),
    partnerCents: 0,
    partnerBalanceCents: balance,
    reason,
  });
  if (!chargeWentWithSplit(i.payment)) return master("cobrança sem split no gateway");
  if (!i.hybridEnabled) return master("estorno híbrido desligado");
  if (i.recipientMissing) return master("recebedor do parceiro não existe no gateway");
  const partner = partnerRule(i.payment.split ?? [])!;
  if (!partner.recipientId) return master("perna do parceiro sem recebedor");
  const cents = partnerRefundCents(i.payment, i.amountCents, i.totalCents);
  if (cents == null) return master("taxa do gateway ainda não apurada");
  if (cents <= 0) return master("parceiro não tem o que devolver nesta venda");
  if (cents >= i.amountCents) return master("parte do parceiro cobre o estorno inteiro; regra exige perna do master");
  const http = i.balance?.httpStatus ?? 0;
  if (!i.balance || http < 200 || http >= 300 || i.balance.availableCents == null) {
    return master("saldo do parceiro sem leitura boa");
  }
  if (i.balance.availableCents < cents) {
    return master(`saldo disponível (${i.balance.availableCents}) não cobre a parte do parceiro (${cents})`, i.balance.availableCents);
  }
  return {
    mode: "partner",
    rules: refundSplitHybrid(i.moveparkRecipientId, partner.recipientId, cents, i.amountCents),
    partnerCents: cents,
    partnerBalanceCents: i.balance.availableCents,
    reason: "saldo disponível cobre o líquido do parceiro",
  };
}

export interface RefundArgs {
  gateway: PaymentGateway;
  chargeId: string;
  payment: RefundablePayment;
  moveparkRecipientId: string;
  /** Omitido = estorno total. */
  amountCents?: number;
  /** Valor total da cobrança em centavos, usado para montar a regra do master no estorno total. */
  totalCents: number;
  /** Estorno híbrido ligado (`pagarme_refund_hybrid_enabled`)? Default false. */
  hybridEnabled?: boolean;
  /** O recebedor do parceiro está marcado `gateway_missing_at`? */
  partnerRecipientMissing?: boolean;
}

export interface RefundExecution {
  result: RefundResult;
  outcome: RefundOutcome;
  /** O que gravar em `payment.refund_absorbed_by_master`. */
  absorbedByMaster: boolean;
  /** As regras enviadas (as que valeram, se houve fallback), para `payment.refund_split`. */
  splitSent: SplitRule[] | undefined;
  /** Quem pagou: `partner` (gateway debitou o parceiro), `master`, ou `none` (sem split). */
  mode: RefundMode;
  /** `payment.refund_partner_cents`. */
  partnerCents: number;
  /** `payment.refund_partner_balance_cents`: saldo disponível lido na decisão. */
  partnerBalanceCents: number | null;
  /** Recebedor do parceiro, para gravar o saldo lido em `payout_recipient`. */
  partnerRecipientId: string | null;
  /** A leitura crua do saldo, quando houve, para o chamador atualizar `payout_recipient`. */
  partnerBalance: RecipientBalance | null;
  /**
   * Taxa do gateway usada na decisão. Quando a apuração de hora em hora ainda não tinha passado,
   * foi lida ao vivo em `GET /payables`; o chamador grava em `payment.gateway_fee_cents`.
   */
  gatewayFeeCents: number | null;
  /** Por que a decisão foi essa, para o log. */
  reason: string;
}

/**
 * Executa o estorno pela regra do E0.3.5 (100% master) ou, com a chave ligada, pela do E0.3.6
 * (gateway debita o parceiro quando o saldo cobre), e devolve o que o chamador precisa gravar.
 *
 * Com o híbrido: lê o saldo do recebedor ao vivo, decide, tenta com as duas regras; se o gateway
 * recusar esse pedido (qualquer não-2xx), tenta de novo 100% master, que é o caminho de sempre. A
 * recusa do segundo pedido é a que o chamador classifica (fila manual ou retry).
 */
export async function executeRefund(a: RefundArgs): Promise<RefundExecution> {
  const cents = a.amountCents ?? a.totalCents;
  const partner = partnerRule(a.payment.split ?? []);
  let balance: RecipientBalance | null = null;
  let payment: RefundablePayment = a.payment;
  const tentaHibrido = a.hybridEnabled && chargeWentWithSplit(a.payment) && !!partner?.recipientId && !a.partnerRecipientMissing;
  if (tentaHibrido) {
    // A taxa é apurada de hora em hora e só dez minutos depois do pago, então o cancelamento
    // logo depois da compra chegaria aqui sem ela e cairia no master à toa. Lê ao vivo.
    if (payment.gateway_fee_cents == null) {
      try {
        const r = await a.gateway.listPayables(a.chargeId);
        const fee = totalGatewayFeeCents(r.payables);
        if (fee != null) payment = { ...payment, gateway_fee_cents: fee };
      } catch (e) {
        console.error("[refund] leitura da taxa ao vivo falhou; decisão segue sem ela:", e);
      }
    }
    try {
      balance = await a.gateway.getRecipientBalance(partner!.recipientId!);
    } catch (e) {
      console.error("[refund] leitura do saldo do parceiro falhou; vai 100% master:", e);
      balance = null;
    }
  }
  const decision = decideRefundSplit({
    payment,
    moveparkRecipientId: a.moveparkRecipientId,
    amountCents: cents,
    totalCents: a.totalCents,
    hybridEnabled: a.hybridEnabled === true,
    balance,
    recipientMissing: a.partnerRecipientMissing,
  });

  const base = {
    partnerRecipientId: partner?.recipientId ?? null,
    partnerBalance: balance,
    gatewayFeeCents: payment.gateway_fee_cents ?? null,
  };

  if (decision.mode === "partner") {
    const tentativa = await a.gateway.refundCharge({
      chargeId: a.chargeId,
      amountCents: a.amountCents,
      split: decision.rules,
    });
    if (classifyRefundOutcome(tentativa.httpStatus, tentativa.status) === "ok") {
      return {
        ...base,
        result: tentativa,
        outcome: "ok",
        absorbedByMaster: false,
        splitSent: decision.rules,
        mode: "partner",
        partnerCents: decision.partnerCents,
        partnerBalanceCents: decision.partnerBalanceCents,
        reason: decision.reason,
      };
    }
    console.error("[refund] gateway recusou o estorno com a perna do parceiro; vai 100% master:", tentativa.httpStatus, JSON.stringify(tentativa.raw));
  }

  const split = refundSplitFor(payment, a.moveparkRecipientId, cents);
  const result = await a.gateway.refundCharge({
    chargeId: a.chargeId,
    amountCents: a.amountCents,
    split,
  });
  return {
    ...base,
    result,
    outcome: classifyRefundOutcome(result.httpStatus, result.status),
    absorbedByMaster: refundAbsorbedByMaster(a.payment),
    splitSent: split,
    mode: split ? "master" : "none",
    partnerCents: 0,
    partnerBalanceCents: decision.partnerBalanceCents,
    reason: decision.mode === "partner" ? "gateway recusou a perna do parceiro; 100% master" : decision.reason,
  };
}

/**
 * O que gravar em `payout_recipient` depois de uma leitura boa do saldo na decisão: o mesmo
 * patch do `refresh-recipients`, para o Manager ficar com o número mais fresco que existe.
 */
export function partnerBalancePatch(exec: RefundExecution, nowIso: string) {
  const b = exec.partnerBalance;
  if (!exec.partnerRecipientId || !b) return null;
  const http = b.httpStatus ?? 0;
  if (http < 200 || http >= 300) return null;
  if (b.availableCents === null && b.waitingFundsCents === null && b.transferredCents === null) return null;
  return {
    recipientId: exec.partnerRecipientId,
    patch: {
      balance_available_cents: b.availableCents ?? 0,
      balance_waiting_cents: b.waitingFundsCents ?? 0,
      balance_transferred_cents: b.transferredCents ?? 0,
      balance_synced_at: nowIso,
    },
  };
}

/**
 * O recebedor do parceiro desta cobrança está marcado como inexistente no gateway
 * (`payout_recipient.gateway_missing_at`)? Nesse caso o híbrido nem tenta. Sem split, ou sem
 * linha, responde falso e a decisão segue pelos outros critérios.
 */
// deno-lint-ignore no-explicit-any
export async function partnerRecipientMissing(admin: any, p: RefundablePayment): Promise<boolean> {
  const partner = partnerRule(p.split ?? []);
  if (!partner?.recipientId) return false;
  const { data } = await admin
    .from("payout_recipient")
    .select("gateway_missing_at")
    .eq("external_recipient_id", partner.recipientId)
    .maybeSingle();
  return !!data?.gateway_missing_at;
}

/** Grava em `payout_recipient` o saldo lido na decisão (quando houve leitura boa). Nunca falha alto. */
// deno-lint-ignore no-explicit-any
export async function persistPartnerBalance(admin: any, exec: RefundExecution): Promise<void> {
  const p = partnerBalancePatch(exec, new Date().toISOString());
  if (!p) return;
  try {
    await admin.from("payout_recipient").update(p.patch).eq("external_recipient_id", p.recipientId);
  } catch (e) {
    console.error("[refund] não gravou o saldo do parceiro lido no estorno:", e);
  }
}
