// Custo de gateway, agnóstico ao provedor: opera sobre `GatewayPayable`, que é tipo da
// interface, não do Pagar.me. Fica fora do adapter de propósito (ADR-004): trocar de gateway
// troca quem PRODUZ os recebíveis, não quem soma o custo deles.

import type { GatewayPayable } from "./types.ts";

/**
 * Custo total da cobrança no gateway: MDR + antecipação + proteção contra fraude, somado sobre
 * TODAS as parcelas. Devolve `null` quando não há recebível, porque zero e "ainda não sei" são
 * coisas diferentes: gravar zero como se fosse medida esconde o que falta apurar.
 */
export function totalGatewayFeeCents(payables: GatewayPayable[]): number | null {
  if (!payables.length) return null;
  return payables.reduce(
    (acc, p) =>
      acc + (p.feeCents ?? 0) + (p.anticipationFeeCents ?? 0) + (p.fraudCoverageFeeCents ?? 0),
    0,
  );
}

/**
 * Quando o gateway libera a parte do PARCEIRO: a maior `payment_date` dos recebíveis de crédito
 * do recebedor dele (cartão parcelado tem um por parcela; a última manda). PIX vem com a data do
 * dia. Sem recebível dele, null: a tela diz "sem previsão" em vez de inventar.
 */
export function partnerReleaseAt(
  payables: GatewayPayable[],
  partnerRecipientId: string | null | undefined,
): string | null {
  if (!partnerRecipientId) return null;
  let best: string | null = null;
  for (const p of payables) {
    if (p.recipientId !== partnerRecipientId) continue;
    if (p.type && p.type !== "credit") continue;
    if (!p.paymentDate) continue;
    if (!best || p.paymentDate > best) best = p.paymentDate;
  }
  return best;
}
