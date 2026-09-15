// O estorno como o E0.3.5 decidiu: sai 100% do master quando a cobrança foi ao gateway com split,
// e a perna do parceiro vira dívida no razão. Cinco lugares estornam (cancel-booking, o "pago sem
// vaga" do webhook e do reconcile-confirmations, delete-account, change-booking-dates-paid) e os
// cinco passam por aqui, para a regra existir uma vez.
//
// Também classifica a recusa do gateway, porque o cancelamento reage diferente: recusa definitiva
// (prazo vencido, sem saldo) vai para a fila de reembolso manual; recusa incerta (rede, 5xx, rate
// limit) aborta e pede para tentar de novo, porque aí tentar de novo funciona.

import type { PaymentGateway, RefundResult, SplitRule } from "./types.ts";
import { partnerRule, refundSplitToMaster } from "./split.ts";

/** O que o helper precisa saber da linha de `payment`. */
export interface RefundablePayment {
  split: SplitRule[] | null | undefined;
  split_sent_to_gateway: boolean | null | undefined;
  debt_recovered_cents?: number | null;
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
export function classifyRefundOutcome(httpStatus: number | null | undefined): RefundOutcome {
  const s = httpStatus ?? 0;
  if (s >= 200 && s < 300) return "ok";
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

export interface RefundArgs {
  gateway: PaymentGateway;
  chargeId: string;
  payment: RefundablePayment;
  moveparkRecipientId: string;
  /** Omitido = estorno total. */
  amountCents?: number;
  /** Valor total da cobrança em centavos, usado para montar a regra do master no estorno total. */
  totalCents: number;
}

export interface RefundExecution {
  result: RefundResult;
  outcome: RefundOutcome;
  /** O que gravar em `payment.refund_absorbed_by_master`. */
  absorbedByMaster: boolean;
  /** As regras enviadas, para diagnóstico. */
  splitSent: SplitRule[] | undefined;
}

/** Executa o estorno pela regra do E0.3.5 e devolve o que o chamador precisa gravar. */
export async function executeRefund(a: RefundArgs): Promise<RefundExecution> {
  const cents = a.amountCents ?? a.totalCents;
  const split = refundSplitFor(a.payment, a.moveparkRecipientId, cents);
  const result = await a.gateway.refundCharge({
    chargeId: a.chargeId,
    amountCents: a.amountCents,
    split,
  });
  return {
    result,
    outcome: classifyRefundOutcome(result.httpStatus),
    absorbedByMaster: refundAbsorbedByMaster(a.payment),
    splitSent: split,
  };
}
