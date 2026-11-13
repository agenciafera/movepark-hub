// Antecipação do cartão do parceiro (E0.3.14). Spec: docs/specs/antecipacao-do-parceiro.md
//
// A Pagar.me desconta a taxa de antecipação do recebedor antecipado e o split não tem campo para
// mudar isso. Quando quem paga é a Movepark, a perna do parceiro recebe a estimativa a mais, com
// folga de dias, para ele nunca terminar abaixo do prometido. O que a estimativa não cobrir vira
// crédito na releitura (reconcile-gateway-fees).

import type { GatewayPayable } from "./types.ts";

export type AnticipationEstimateArgs = {
  installments: number;
  /** Perna do parceiro no split, em centavos. */
  partnerLegCents: number;
  /** MDR descontado da perna do parceiro (zero quando a Movepark paga o MDR). */
  partnerMdrCents: number;
  /** Taxa mensal de antecipação em basis points (310 = 3,10% ao mês). */
  monthlyRateBps: number;
  /** Folga em dias somada a cada parcela. */
  marginDays: number;
};

/**
 * δ tal que (L + δ − m) × (1 − f) ≥ L − m, com f = taxa/30 × média dos dias antecipados.
 * A parcela i (1..n) é antecipada por volta de 30 × (i − 1) dias, mais a folga.
 */
export function estimateAnticipationCompCents(a: AnticipationEstimateArgs): number {
  const n = Math.floor(a.installments);
  const net = Math.floor(a.partnerLegCents) - Math.max(0, Math.floor(a.partnerMdrCents));
  if (n < 1 || net <= 0 || a.monthlyRateBps <= 0) return 0;
  let sumDays = 0;
  for (let i = 1; i <= n; i++) sumDays += 30 * (i - 1) + Math.max(0, a.marginDays);
  const f = (a.monthlyRateBps / 10000 / 30) * (sumDays / n);
  if (f <= 0 || f >= 1) return 0;
  return Math.ceil((net * f) / (1 - f) - 1e-9);
}

/** Taxa de antecipação real por perna, só dos recebíveis de crédito (a venda). */
export function anticipationFeesByRecipient(
  payables: GatewayPayable[],
  moveparkRecipientId: string,
): { partnerCents: number; moveparkCents: number } {
  let partnerCents = 0;
  let moveparkCents = 0;
  for (const p of payables) {
    if (p.type && p.type !== "credit") continue;
    const fee = Math.max(0, p.anticipationFeeCents ?? 0);
    if (p.recipientId === moveparkRecipientId) moveparkCents += fee;
    else partnerCents += fee;
  }
  return { partnerCents, moveparkCents };
}
