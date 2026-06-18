// Montador de split — lógica de negócio agnóstica ao gateway. A comissão da Movepark
// (take_rate) é calculada sobre o PREÇO BASE da reserva; o parceiro recebe o restante do base.
// Quando o valor cobrado é maior que o base (juros de parcelamento repassado ao cliente, E0.1.3),
// o EXCEDENTE vai para a Movepark. Decisão (E0.1.2): o PARCEIRO absorve as taxas do gateway.
//
// PIX (E0.1.2) passa chargedCents == baseCents → resultado idêntico ao comportamento original.

import type { SplitRule } from "./types.ts";

export interface BuildSplitArgs {
  /** Total efetivamente cobrado (com juros de parcelamento, se houver). */
  chargedCents: number;
  /** Preço base da reserva — base do repasse ao parceiro e da comissão. */
  baseCents: number;
  takeRateBps: number; // basis points (1500 = 15%)
  moveparkRecipientId: string;
  partnerRecipientId: string;
}

/**
 * Divide o valor cobrado entre parceiro (líquido sobre o base, absorve taxas) e Movepark
 * (comissão + excedente de juros). Soma SEMPRE == chargedCents (exigência do gateway).
 */
export function buildSplit({
  chargedCents,
  baseCents,
  takeRateBps,
  moveparkRecipientId,
  partnerRecipientId,
}: BuildSplitArgs): SplitRule[] {
  if (!Number.isInteger(baseCents) || baseCents <= 0) {
    throw new Error("Valor da cobrança inválido.");
  }
  if (!Number.isInteger(chargedCents) || chargedCents < baseCents) {
    throw new Error("Valor cobrado inválido (menor que o preço base).");
  }
  if (!partnerRecipientId) throw new Error("Recebedor do parceiro ausente.");

  const commission = Math.min(
    baseCents,
    Math.max(0, Math.round((baseCents * takeRateBps) / 10000)),
  );
  const partnerAmount = baseCents - commission;
  if (partnerAmount <= 0) {
    throw new Error("Comissão (take_rate) não pode consumir todo o valor da reserva.");
  }
  // Movepark fica com a comissão + o excedente cobrado (juros do parcelamento).
  const moveparkAmount = chargedCents - partnerAmount;

  // Parceiro: absorve taxa e risco; recebe o líquido do preço base.
  const rules: SplitRule[] = [
    {
      recipientId: partnerRecipientId,
      amount: partnerAmount,
      type: "flat",
      liable: true,
      chargeProcessingFee: true,
      chargeRemainderFee: true,
    },
  ];

  // Movepark: comissão + excedente, sem taxa/risco.
  if (moveparkAmount > 0) {
    if (!moveparkRecipientId) throw new Error("Recebedor master da Movepark não configurado.");
    rules.push({
      recipientId: moveparkRecipientId,
      amount: moveparkAmount,
      type: "flat",
      liable: false,
      chargeProcessingFee: false,
      chargeRemainderFee: false,
    });
  }

  // Invariante dura: o split tem que fechar exatamente no valor cobrado.
  const sum = rules.reduce((acc, r) => acc + r.amount, 0);
  if (sum !== chargedCents) {
    throw new Error(`Split não fecha: soma ${sum} != cobrado ${chargedCents}.`);
  }

  return rules;
}
