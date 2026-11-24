// Taxas da reserva destrinchadas (23/11/2026): o que a Pagar.me cobrou parcela por parcela, a
// comissão e os juros, comparados com a tabela contratada. Lógica pura; o modal só desenha.
// Os recebíveis vêm do último evento `payables` do rastro (`booking_gateway_trail`), o mesmo
// GET /payables que a Edge reconcile-gateway-fees soma em `payment.gateway_fee_cents`. Só
// `parsePayables` conhece o formato da Pagar.me; o resto opera no formato da interface (ADR-004).
// Spec: docs/specs/taxas-da-reserva.md

import {
  applyInstallmentOverride,
  computeInstallmentPlan,
  type InstallmentOption,
  type InstallmentPolicy,
} from "@/lib/installments";
import {
  bandFor,
  cet30For,
  differsFromContract,
  type FeeBand,
  type GatewayFeeSchedule,
} from "@/lib/gatewayFees";
import type { MoneyBreakdown } from "./bookingMoney.logic";

/** Recebível no formato de `GatewayPayable` (_shared/payments) mais a data original. */
export interface FeePayable {
  recipientId: string | null;
  amountCents: number;
  feeCents: number;
  anticipationFeeCents: number;
  fraudCoverageFeeCents: number;
  installment: number | null;
  paymentDate: string | null;
  /** Vencimento original. Sem antecipação a Pagar.me nem manda, e vale a `paymentDate`. */
  originalPaymentDate: string | null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

/** Lê o `response` cru de um evento `payables`. Só crédito: o refund é a conta do estorno. */
export function parsePayables(raw: unknown): FeePayable[] {
  const data = raw && typeof raw === "object" ? (raw as { data?: unknown }).data : null;
  if (!Array.isArray(data)) return [];
  return (data as Record<string, unknown>[])
    .filter((r) => r && (r.type == null || r.type === "credit"))
    .map((r) => {
      const paymentDate = str(r.payment_date);
      return {
        recipientId: str(r.recipient_id),
        amountCents: num(r.amount),
        feeCents: num(r.fee),
        anticipationFeeCents: num(r.anticipation_fee),
        fraudCoverageFeeCents: num(r.fraud_coverage_fee),
        installment: typeof r.installment === "number" ? r.installment : null,
        paymentDate,
        originalPaymentDate: str(r.original_payment_date) ?? paymentDate,
      };
    });
}

export interface PayablesEventLike {
  payment_id: string | null;
  kind: string;
  response: unknown;
  created_at: string;
}

/**
 * Recebíveis do último evento `payables` do pagamento que trouxe recebível; null sem nenhum. Uma
 * leitura com erro da Pagar.me (ou vazia) não apaga a anterior (MP-573C3E, 19/11/2026).
 */
export function latestPayables(
  events: PayablesEventLike[] | null | undefined,
  paymentId: string,
): FeePayable[] | null {
  const ordered = (events ?? [])
    .filter((e) => e.kind === "payables" && e.payment_id === paymentId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const e of ordered) {
    const rows = parsePayables(e.response);
    if (rows.length) return rows;
  }
  return null;
}

/** Na visão do estacionamento o recebedor chega como "movepark" ou "partner", nunca o id na Pagar.me. */
export const PARTNER_VIEW_MOVEPARK = "movepark";

/** Um pagamento como a RPC `partner_booking_payables` devolve: o último evento com recebível. */
export interface PartnerPayablesEntry {
  payment_id: string;
  created_at: string;
  rows: unknown;
}

/** Recebíveis do pagamento na visão do estacionamento; null sem nenhum (24/11/2026). */
export function partnerPayables(
  entries: PartnerPayablesEntry[] | null | undefined,
  paymentId: string,
): FeePayable[] | null {
  const e = (entries ?? []).find((x) => x.payment_id === paymentId);
  if (!e || !Array.isArray(e.rows)) return null;
  const rows = parsePayables({
    data: (e.rows as Record<string, unknown>[]).map((r) =>
      r && typeof r === "object" ? { ...r, recipient_id: r.recipient ?? null } : r,
    ),
  });
  return rows.length ? rows : null;
}

export interface FeePaymentLike {
  method: string | null;
  /** Valor cobrado, em reais. */
  amount: number;
  installments: number | null;
  gateway_fee_cents: number | null;
  anticipation_credit_cents?: number | null;
  /** Quanto a Movepark cedeu no split para cobrir a antecipação do parceiro (E0.3.14). */
  anticipation_comp_cents?: number | null;
  /** Taxa de antecipação prevista quando o próprio parceiro paga (gravada na cobrança). */
  anticipation_estimate_cents?: number | null;
}

export interface FeeBookingLike {
  total_amount: number;
  commission_channel?: string | null;
  commission_take_rate_bps?: number | null;
  commission_anticipation_payer?: string | null;
  commission_installments_max?: number | null;
  commission_installments_interest_free?: number | null;
}

type Payer = "partner" | "movepark";

export type FeeLine =
  | {
      key: "commission";
      cents: number | null;
      rateBps: number | null;
      channel: string | null;
      payer: "partner";
    }
  | {
      key: "interest";
      cents: number;
      rule: { monthlyPct: number; freeUpTo: number } | null;
      payer: "customer";
    }
  | {
      key: "mdr";
      method: "card" | "pix";
      cents: number | null;
      effectiveBps: number | null;
      contractBps: number | null;
      differs: boolean;
      payer: Payer;
    }
  | {
      key: "anticipation";
      cents: number | null;
      partnerCents: number;
      moveparkCents: number;
      anticipatedAt: string | null;
      creditCents: number;
      /** O que a Movepark cedeu no split para cobrir a antecipação do parceiro. */
      compCents: number;
      /** A antecipação ainda não aconteceu: o valor é o previsto (a cessão gravada). */
      expected: boolean;
      payer: Payer;
    }
  | { key: "antifraud"; cents: number | null; payer: Payer }
  /**
   * Venda à vista que nasceu com cessão para antecipação (regra antiga, 15 a 23/11/2026): à vista
   * não tem antecipação, e o que a Movepark passou ficou com o estacionamento. Não é taxa.
   */
  | { key: "cession"; cents: number; payer: "movepark" };

export interface FeeInstallmentRow {
  installment: number;
  /** O que o cliente vê na fatura: cobrado dividido pelas parcelas, resto na primeira. */
  customerCents: number;
  originalDate: string | null;
  receivedDate: string | null;
  mdrCents: number | null;
  anticipationCents: number | null;
  /** Data de entrada e taxa de antecipação desta parcela são previstas. */
  expected: boolean;
}

export interface FeeDetail {
  summary: {
    method: "card" | "pix";
    chargedCents: number;
    installments: number;
    firstInstallmentCents: number;
    installmentCents: number;
    partnerNetCents: number | null;
    moveparkNetCents: number | null;
    custody: boolean;
    refundedCents: number;
  };
  lines: FeeLine[];
  gateway: {
    linesCents: number | null;
    recordedCents: number | null;
    /** Antecipação prevista que ainda vai sair (zero quando já saiu ou não se aplica). */
    expectedCents: number;
    pending: boolean;
    stale: boolean;
    detailed: boolean;
  };
  installments: FeeInstallmentRow[];
  plan: { options: InstallmentOption[]; chosen: number; reproduces: boolean };
  band: FeeBand | null;
  /** Custo para receber em 30 dias do contrato, para as parcelas desta venda (só cartão). */
  cet30Bps: number | null;
  schedule: GatewayFeeSchedule | null;
}

const total = (rows: FeePayable[], f: (p: FeePayable) => number) =>
  rows.reduce((a, p) => a + f(p), 0);
const earliest = (dates: (string | null)[]) =>
  dates.filter((d): d is string => !!d).sort()[0] ?? null;

export function buildFeeDetail(args: {
  money: MoneyBreakdown;
  payment: FeePaymentLike;
  booking: FeeBookingLike;
  payables: FeePayable[] | null;
  schedule: GatewayFeeSchedule | null;
  policy: InstallmentPolicy;
  moveparkRecipientId: string | null;
}): FeeDetail {
  const { money, payment, booking, payables, schedule, policy, moveparkRecipientId } = args;
  const method: "card" | "pix" = payment.method === "card" ? "card" : "pix";
  const chargedCents = money.customer.chargedCents ?? Math.round(Number(payment.amount) * 100);
  const totalCents = money.customer.totalCents;
  const n = method === "card" ? Math.max(1, payment.installments ?? 1) : 1;
  const base = Math.floor(chargedCents / n);
  const first = chargedCents - base * (n - 1);
  const split = money.split;
  const feePayer: Payer = split?.feePayer ?? "movepark";
  const rows = payables ?? [];

  // A política de hoje com o parcelamento congelado na reserva. Se ela não reproduz o valor
  // cobrado, a venda seguiu outra condição e a tela não inventa percentual.
  const effectivePolicy = applyInstallmentOverride(policy, {
    max: booking.commission_installments_max,
    interestFree: booking.commission_installments_interest_free,
  });
  const options = computeInstallmentPlan(totalCents, effectivePolicy);
  const reproduces = options.find((o) => o.installments === n)?.totalCents === chargedCents;

  const lines: FeeLine[] = [
    {
      key: "commission",
      cents: split ? split.movepark.commissionCents : null,
      rateBps: booking.commission_take_rate_bps ?? null,
      channel: booking.commission_channel ?? null,
      payer: "partner",
    },
  ];

  const interestCents = Math.max(0, chargedCents - totalCents);
  if (interestCents > 0)
    lines.push({
      key: "interest",
      cents: interestCents,
      rule: reproduces
        ? {
            monthlyPct: effectivePolicy.monthlyInterestPct,
            freeUpTo: effectivePolicy.interestFreeUpTo,
          }
        : null,
      payer: "customer",
    });

  const mdrCents = payables ? total(rows, (p) => p.feeCents) : null;
  const effectiveBps =
    mdrCents != null && chargedCents > 0
      ? Math.round((mdrCents * 1_000_000) / chargedCents) / 100
      : null;
  const band = method === "card" ? bandFor(schedule, n) : null;
  const contractBps = method === "card" ? (band?.bps ?? null) : (schedule?.pix_bps ?? null);
  lines.push({
    key: "mdr",
    method,
    cents: mdrCents,
    effectiveBps,
    contractBps,
    differs: differsFromContract(effectiveBps, contractBps),
    payer: feePayer,
  });

  // Antecipação (E0.3.14): a Pagar.me antecipa o cartão do parceiro por volta do D+29 e só então a
  // taxa aparece nos recebíveis. Antes disso, se a Movepark cedeu a estimativa no split, a taxa é
  // a prevista (a cessão) e as parcelas entram todas junto com a 1ª.
  // Quando quem paga é o próprio estacionamento, não há cessão: a prevista é a estimativa que a
  // cobrança gravou.
  const comp = Math.max(0, payment.anticipation_comp_cents ?? 0);
  const previsto = comp > 0 ? comp : Math.max(0, payment.anticipation_estimate_cents ?? 0);
  const anticipatedRows = rows.filter((p) => p.anticipationFeeCents > 0);
  const anticipationReal = total(anticipatedRows, (p) => p.anticipationFeeCents);
  // À vista não tem antecipação: a parcela única já cai em ~30 dias (taxa zero nas vendas 1x relidas).
  const expected = method === "card" && n > 1 && previsto > 0 && anticipationReal === 0;
  const firstDate = earliest(
    rows.filter((p) => p.installment === 1).map((p) => p.originalPaymentDate),
  );
  // À vista não fala em antecipação: a linha só existe parcelado ou se o recebível trouxer taxa.
  // A cessão antiga de uma venda à vista vira linha própria (MP-784999, 24/11/2026).
  if (method === "card" && n === 1 && anticipationReal === 0) {
    if (comp > 0) lines.push({ key: "cession", cents: comp, payer: "movepark" });
  } else if (method === "card") {
    const moveparkCents = total(
      anticipatedRows.filter(
        (p) => moveparkRecipientId != null && p.recipientId === moveparkRecipientId,
      ),
      (p) => p.anticipationFeeCents,
    );
    lines.push({
      key: "anticipation",
      cents: expected ? previsto : payables ? anticipationReal : null,
      partnerCents: expected ? previsto : anticipationReal - moveparkCents,
      moveparkCents: expected ? 0 : moveparkCents,
      anticipatedAt: expected ? firstDate : earliest(anticipatedRows.map((p) => p.paymentDate)),
      creditCents: Math.max(0, payment.anticipation_credit_cents ?? 0),
      compCents: comp,
      expected,
      payer: booking.commission_anticipation_payer === "partner" ? "partner" : "movepark",
    });
  }

  lines.push({
    key: "antifraud",
    cents: payables ? total(rows, (p) => p.fraudCoverageFeeCents) : null,
    payer: feePayer,
  });

  const linesCents = payables
    ? total(rows, (p) => p.feeCents + p.anticipationFeeCents + p.fraudCoverageFeeCents)
    : null;
  const recordedCents = payment.gateway_fee_cents;

  // Taxa prevista por parcela: proporcional aos dias antecipados (0, 30, 60...), resto na última.
  const weightSum = (n * (n - 1)) / 2;
  const expectedShare = (k: number) => {
    if (!expected || weightSum === 0) return 0;
    if (k === n) {
      let rest = previsto;
      for (let j = 1; j < n; j++) rest -= Math.floor((previsto * (j - 1)) / weightSum);
      return rest;
    }
    return Math.floor((previsto * (k - 1)) / weightSum);
  };

  const installments: FeeInstallmentRow[] =
    method === "card"
      ? Array.from({ length: n }, (_, i) => {
          const k = i + 1;
          const deste = rows.filter((p) => p.installment === k);
          const originalDate = earliest(deste.map((p) => p.originalPaymentDate));
          const realAnticipation = payables ? total(deste, (p) => p.anticipationFeeCents) : null;
          return {
            installment: k,
            customerCents: k === 1 ? first : base,
            originalDate,
            receivedDate: expected
              ? (firstDate ?? originalDate)
              : earliest(deste.map((p) => p.paymentDate)),
            mdrCents: payables ? total(deste, (p) => p.feeCents) : null,
            anticipationCents: expected ? expectedShare(k) : realAnticipation,
            expected: expected && k > 1,
          };
        })
      : [];

  return {
    summary: {
      method,
      chargedCents,
      installments: n,
      firstInstallmentCents: first,
      installmentCents: base,
      partnerNetCents: split ? split.partner.netCents : null,
      moveparkNetCents: split ? split.movepark.netCents : null,
      custody: split?.custody ?? false,
      refundedCents: money.refund?.totalCents ?? 0,
    },
    lines,
    gateway: {
      linesCents,
      recordedCents,
      expectedCents: expected ? previsto : 0,
      pending: recordedCents == null,
      stale: linesCents != null && recordedCents != null && linesCents !== recordedCents,
      detailed: payables != null,
    },
    installments,
    plan: { options, chosen: n, reproduces },
    band,
    cet30Bps: method === "card" ? cet30For(schedule, n) : null,
    schedule,
  };
}
