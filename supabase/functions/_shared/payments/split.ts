// Montador de split — lógica de negócio agnóstica ao gateway. A comissão da Movepark
// (take_rate) vai para o recebedor master; o restante para o recebedor do parceiro.
// Decisão (E0.1.2): o PARCEIRO absorve as taxas do gateway (liable + processing + remainder).

import type { SplitRule } from "./types.ts";

export interface BuildSplitArgs {
  totalCents: number;
  takeRateBps: number; // basis points (1500 = 15%)
  moveparkRecipientId: string;
  partnerRecipientId: string;
}

/**
 * Divide o total entre parceiro (líquido, absorve taxas) e Movepark (comissão).
 * Soma sempre == total (exigência do gateway). Se a comissão for 0, devolve só a perna do parceiro.
 */
export function buildSplit({
  totalCents,
  takeRateBps,
  moveparkRecipientId,
  partnerRecipientId,
}: BuildSplitArgs): SplitRule[] {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new Error("Valor da cobrança inválido.");
  }
  if (!partnerRecipientId) throw new Error("Recebedor do parceiro ausente.");

  const commission = Math.min(
    totalCents,
    Math.max(0, Math.round((totalCents * takeRateBps) / 10000)),
  );
  const partnerAmount = totalCents - commission;
  if (partnerAmount <= 0) {
    throw new Error("Comissão (take_rate) não pode consumir todo o valor da reserva.");
  }

  // Parceiro: absorve taxa e risco.
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

  // Movepark: só a comissão, sem taxa/risco.
  if (commission > 0) {
    if (!moveparkRecipientId) throw new Error("Recebedor master da Movepark não configurado.");
    rules.push({
      recipientId: moveparkRecipientId,
      amount: commission,
      type: "flat",
      liable: false,
      chargeProcessingFee: false,
      chargeRemainderFee: false,
    });
  }

  return rules;
}
