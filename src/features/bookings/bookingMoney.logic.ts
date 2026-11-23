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
  paid_at?: string | null;
  refunded_amount: number | null;
  refund_absorbed_by_master: boolean;
  refund_partner_cents: number;
  created_at: string;
  /** Quanto a perna da Movepark cedeu à do parceiro para cobrir a antecipação (E0.3.14). */
  anticipation_comp_cents?: number | null;
  /** Taxa de antecipação real na perna do parceiro, gravada na releitura (~D+31). */
  anticipation_fee_partner_cents?: number | null;
  /** Idem na perna da Movepark. */
  anticipation_fee_movepark_cents?: number | null;
  /** Taxa de antecipação que a Movepark devolve ao parceiro como crédito. */
  anticipation_credit_cents?: number | null;
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
    partner: {
      grossCents: number;
      debtRecoveredCents: number;
      /** Taxa do cartão (MDR e antifraude) na conta do parceiro. A antecipação fica à parte. */
      feeCents: number;
      /** O que a Movepark cedeu no split para cobrir a antecipação do parceiro. */
      compCents: number;
      /** Taxa de antecipação na perna do parceiro: a real depois da releitura, a cessão antes dela. */
      anticipationCents: number;
      /** A antecipação ainda não aconteceu: `anticipationCents` é a prevista. */
      anticipationExpected: boolean;
      /** Taxa de antecipação devolvida pela Movepark como crédito. */
      creditCents: number;
      netCents: number;
      /** Quando o gateway libera o recebível da parte do parceiro. */
      releaseAt: string | null;
      /** Quando a venda entra no disponível para saque: pagamento + prazo da empresa. */
      withdrawAt: string | null;
    };
    /** Quem paga a taxa do gateway nesta venda (pela regra de comissão, E0.3.12). */
    feePayer: "partner" | "movepark";
    movepark: {
      commissionCents: number;
      fareCents: number;
      interestCents: number;
      debtRecoveredCents: number;
      /** Taxa do gateway que sai da Movepark: o MDR quando é ela quem paga, mais a antecipação da perna dela. */
      feeCents: number;
      compCents: number;
      creditCents: number;
      netCents: number;
    };
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
  /** Prazo de saque da empresa em dias (`payout_release_days`); sem ele, a data de saque fica vazia. */
  releaseDays: number | null = null,
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
    // Antecipação (E0.3.14). O `split` gravado é o normal; a cessão da Movepark vai ao gateway por
    // cima dele. Antes da releitura a taxa do parceiro é a prevista, igual à cessão; depois, é a real
    // de cada perna, e o que a Movepark devolve como crédito entra na conta do parceiro.
    const pos = (v: number | null | undefined) => Math.max(0, v ?? 0);
    const comp = custody ? 0 : pos(payment.anticipation_comp_cents);
    const reread = payment.anticipation_fee_partner_cents != null || payment.anticipation_fee_movepark_cents != null;
    const antPartnerReal = custody ? 0 : pos(payment.anticipation_fee_partner_cents);
    const antMovepark = pos(payment.anticipation_fee_movepark_cents) + (custody ? pos(payment.anticipation_fee_partner_cents) : 0);
    const credit = custody ? 0 : pos(payment.anticipation_credit_cents);
    const mdrCents = Math.max(0, feeCents - antPartnerReal - antMovepark);
    const partnerFee = !custody && partnerPaysFee ? mdrCents : 0;
    const partnerAnt = reread ? antPartnerReal : comp;
    const moveparkFee = mdrCents - partnerFee + antMovepark;
    const moveparkNominal = chargedCents - partnerGross;
    const commissionCents = Math.max(0, moveparkNominal - fareCents - interestCents);
    split = {
      custody,
      partner: {
        grossCents: partnerGross,
        debtRecoveredCents: debt,
        feeCents: partnerFee,
        compCents: comp,
        anticipationCents: partnerAnt,
        anticipationExpected: !reread && comp > 0,
        creditCents: credit,
        netCents: Math.max(0, partnerGross + comp - debt - partnerFee - partnerAnt + credit),
        releaseAt: payment.partner_release_at,
        withdrawAt:
          releaseDays != null && payment.paid_at
            ? new Date(new Date(payment.paid_at).getTime() + releaseDays * 86_400_000).toISOString()
            : null,
      },
      feePayer: partnerPaysFee ? "partner" : "movepark",
      movepark: {
        commissionCents,
        fareCents,
        interestCents,
        debtRecoveredCents: debt,
        feeCents: moveparkFee,
        compCents: comp,
        creditCents: credit,
        netCents: moveparkNominal + debt - comp - moveparkFee - credit,
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

export interface PartnerMoneyView {
  /** Diárias (e serviços extras) da reserva: o valor que é do estacionamento antes da comissão. */
  parkingCents: number;
  /** Cupom que saiu da conta do estacionamento. Zero quando a Movepark absorveu o desconto. */
  discountCents: number;
  commissionCents: number;
  debtRecoveredCents: number;
  feeCents: number;
  feePending: boolean;
  /**
   * Acerto da antecipação na conta do parceiro (E0.3.14): cessão da Movepark mais crédito menos a
   * taxa real. Zero quando a Movepark cobre exatamente; positivo é a folga que ficou com ele;
   * negativo é antecipação paga por ele.
   */
  anticipationCents: number;
  netCents: number | null;
  custody: boolean;
  /** O que o cliente pagou além das diárias (plano, juros): "taxas e custos da plataforma". */
  platformCents: number;
  chargedCents: number;
}

/**
 * A conta que o parceiro faz (08/10/2026): diárias menos comissão dá o que ele recebe. O plano e os
 * juros não são dele, então não entram na conta; aparecem somados como "taxas e custos da
 * plataforma", ao lado do que o cliente pagou. A comissão é o que falta para fechar a conta com a
 * perna dele no split, para a tela sempre bater com o que cai no saldo.
 */
export function partnerMoneyView(money: MoneyBreakdown): PartnerMoneyView {
  const { customer, split } = money;
  const sum = (kinds: CustomerLineKind[]) =>
    customer.lines.filter((l) => kinds.includes(l.kind)).reduce((a, l) => a + l.cents, 0);
  const parkingCents = sum(["parking", "addon"]);
  const discount = Math.max(0, -sum(["discount"]));
  const gross = split?.partner.grossCents ?? null;
  // Se a perna do parceiro passa do que sobra depois do cupom, quem pagou o cupom foi a Movepark.
  const discountCents = gross != null && gross > parkingCents - discount ? 0 : discount;
  const base = parkingCents - discountCents;
  const chargedCents = customer.chargedCents ?? customer.totalCents;
  return {
    parkingCents,
    discountCents,
    commissionCents: gross != null ? Math.max(0, base - gross) : 0,
    debtRecoveredCents: split?.partner.debtRecoveredCents ?? 0,
    feeCents: split?.partner.feeCents ?? 0,
    feePending: !!split && split.feePending && split.feePayer === "partner" && !split.custody,
    anticipationCents: split
      ? split.partner.compCents + split.partner.creditCents - split.partner.anticipationCents
      : 0,
    netCents: split ? split.partner.netCents : null,
    custody: split?.custody ?? false,
    platformCents: Math.max(0, chargedCents - (parkingCents - discount)),
    chargedCents,
  };
}

/** Valor das diárias (e serviços extras) de uma reserva, em reais; sem detalhamento, o total. */
export function bookingParkingAmount(priceBreakdown: PriceBreakdownLike | null | undefined, bookingTotal: number): number {
  const items = (priceBreakdown?.line_items ?? []).filter((li) => li.kind !== "fare");
  if (!priceBreakdown?.line_items?.length) return Number(bookingTotal) || 0;
  return Math.round(items.reduce((a, li) => a + toCents(li.subtotal), 0)) / 100;
}

const PARTNER_STATUSES = new Set(["confirmed", "checked_in", "completed", "no_show"]);

/**
 * Reserva que o estacionamento vê na lista (08/10/2026): só a que virou venda. Expirada, recusada,
 * aguardando pagamento e cancelada sem nunca ter sido paga ficam só para o time Movepark: para o
 * parceiro é ruído e, em volume, parece venda perdida por ele.
 */
export function partnerSeesBooking(b: { status: string; payments?: { status: string }[] | null }): boolean {
  if (PARTNER_STATUSES.has(b.status)) return true;
  if (b.status !== "cancelled") return false;
  return (b.payments ?? []).some((p) => p.status === "paid" || p.status === "refunded");
}
