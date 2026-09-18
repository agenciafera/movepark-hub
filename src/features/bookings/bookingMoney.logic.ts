// O dinheiro de uma reserva, destrinchado (18/09/2026): o que o cliente pagou (diária, plano,
// desconto, juros), para onde foi (estacionamento, Movepark, taxa do gateway, abatimento de
// dívida) e o que voltou no estorno. Lógica pura; a tela só desenha.
//
// Fontes: `booking.price_breakdown` (o que foi vendido) e o pagamento do rastro do gateway
// (`booking_gateway_trail`: split, taxa, abatimento, estorno). O `split` gravado é a perna NORMAL
// do parceiro; o abatimento de dívida fica ao lado e sai da perna dele para a Movepark.

export interface BreakdownLineItem {
  kind: string;
  name?: string | null;
  quantity?: number | null;
  subtotal: number;
  tier?: string | null;
}

export interface PriceBreakdownLike {
  line_items?: BreakdownLineItem[] | null;
  coupon?: { code?: string | null } | null;
  days?: number | null;
  total?: number | null;
}

export interface MoneyPaymentLike {
  status: string;
  method: string | null;
  /** Valor cobrado, em reais. */
  amount: number;
  installments: number | null;
  split: { role?: string; amount: number; liable?: boolean; chargeProcessingFee?: boolean }[] | null;
  split_sent_to_gateway: boolean | null;
  debt_recovered_cents: number;
  gateway_fee_cents: number | null;
  partner_release_at: string | null;
  refunded_amount: number | null;
  refund_absorbed_by_master: boolean;
  refund_partner_cents: number;
  created_at: string;
}

export type CustomerLineKind = "parking" | "fare" | "addon" | "discount" | "interest";

export interface MoneyBreakdown {
  customer: {
    lines: { kind: CustomerLineKind; label: string; cents: number }[];
    /** Total da reserva (sem juros). */
    totalCents: number;
    /** O que foi cobrado de fato (com juros do parcelamento, quando houver). */
    chargedCents: number | null;
    method: string | null;
    installments: number | null;
  };
  /** Divisão do que foi cobrado. Null sem pagamento pago. */
  split: {
    /** Cobrança sem split no gateway: o valor inteiro ficou na Movepark, e a parte do parceiro é "a repassar". */
    custody: boolean;
    partner: { grossCents: number; debtRecoveredCents: number; feeCents: number; netCents: number; releaseAt: string | null };
    movepark: { commissionCents: number; fareCents: number; interestCents: number; debtRecoveredCents: number; feeCents: number; netCents: number };
    /** Taxa do gateway ainda não apurada (até 30 min depois do pagamento). */
    feePending: boolean;
    feeCents: number;
  } | null;
  refund: { totalCents: number; partnerCents: number; moveparkCents: number; debtCents: number } | null;
}

const toCents = (reais: number | null | undefined) => Math.round((Number(reais) || 0) * 100);

const isPartner = (r: { role?: string; liable?: boolean }) => (typeof r.role === "string" ? r.role === "partner" : r.liable === true);

/** O pagamento que conta para a tela: o pago/estornado mais recente; sem ele, o último. */
export function mainPayment<T extends { status: string; created_at: string }>(payments: T[] | null | undefined): T | null {
  if (!payments?.length) return null;
  const sorted = [...payments].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return sorted.find((p) => p.status === "paid" || p.status === "refunded") ?? sorted[0];
}

const FARE_LABEL: Record<string, string> = { basica: "Básica", flex: "Flex", superflex: "Superflex" };

export function buildMoneyBreakdown(
  priceBreakdown: PriceBreakdownLike | null | undefined,
  bookingTotal: number,
  payment: MoneyPaymentLike | null,
): MoneyBreakdown {
  const totalCents = toCents(bookingTotal);
  const lines: MoneyBreakdown["customer"]["lines"] = [];
  let positive = 0;
  let fareCents = 0;
  for (const li of priceBreakdown?.line_items ?? []) {
    const cents = toCents(li.subtotal);
    if (li.kind === "parking") {
      const dias = priceBreakdown?.days ?? li.quantity ?? null;
      lines.push({ kind: "parking", label: dias && dias > 1 ? `Estacionamento (${dias} diárias)` : "Estacionamento (diária)", cents });
    } else if (li.kind === "fare") {
      fareCents += cents;
      lines.push({ kind: "fare", label: `Plano ${FARE_LABEL[li.tier ?? ""] ?? li.name ?? ""}`.trim(), cents });
    } else {
      lines.push({ kind: "addon", label: li.name ?? "Serviço extra", cents });
    }
    positive += cents;
  }
  if (lines.length === 0) {
    lines.push({ kind: "parking", label: "Estacionamento", cents: totalCents });
    positive = totalCents;
  }
  const discount = positive - totalCents;
  if (discount > 0) {
    const code = priceBreakdown?.coupon?.code;
    lines.push({ kind: "discount", label: code ? `Cupom ${code}` : "Desconto", cents: -discount });
  }

  const chargedCents = payment ? toCents(payment.amount) : null;
  const interestCents = chargedCents != null ? Math.max(0, chargedCents - totalCents) : 0;
  if (interestCents > 0) lines.push({ kind: "interest", label: "Juros do parcelamento", cents: interestCents });

  const pago = payment && (payment.status === "paid" || payment.status === "refunded");
  let split: MoneyBreakdown["split"] = null;
  let refund: MoneyBreakdown["refund"] = null;

  if (pago && payment && chargedCents != null) {
    const rules = payment.split ?? [];
    const partnerRules = rules.filter(isPartner);
    const partnerGross = partnerRules.reduce((a, r) => a + r.amount, 0);
    const partnerPaysFee = partnerRules.some((r) => r.chargeProcessingFee === true);
    const custody = payment.split_sent_to_gateway !== true;
    const feeCents = Math.max(0, payment.gateway_fee_cents ?? 0);
    const feePending = payment.gateway_fee_cents == null;
    const debt = custody ? 0 : Math.max(0, payment.debt_recovered_cents ?? 0);
    const partnerFee = !custody && partnerPaysFee ? feeCents : 0;
    const moveparkFee = feeCents - partnerFee;
    const moveparkNominal = chargedCents - partnerGross;
    const commissionCents = Math.max(0, moveparkNominal - fareCents - interestCents);
    split = {
      custody,
      partner: {
        grossCents: partnerGross,
        debtRecoveredCents: debt,
        feeCents: partnerFee,
        netCents: Math.max(0, partnerGross - debt - partnerFee),
        releaseAt: payment.partner_release_at,
      },
      movepark: {
        commissionCents,
        fareCents,
        interestCents,
        debtRecoveredCents: debt,
        feeCents: moveparkFee,
        netCents: moveparkNominal + debt - moveparkFee,
      },
      feePending,
      feeCents,
    };

    const refundedCents = toCents(payment.refunded_amount);
    if (refundedCents > 0) {
      const partnerCents = Math.max(0, payment.refund_partner_cents ?? 0);
      const ratio = chargedCents > 0 ? Math.min(1, refundedCents / chargedCents) : 0;
      const debtCents = payment.refund_absorbed_by_master && !custody
        ? Math.round(Math.max(0, partnerGross - partnerFee) * ratio)
        : 0;
      refund = { totalCents: refundedCents, partnerCents, moveparkCents: refundedCents - partnerCents, debtCents };
    }
  }

  return {
    customer: { lines, totalCents, chargedCents, method: payment?.method ?? null, installments: payment?.installments ?? null },
    split,
    refund,
  };
}
