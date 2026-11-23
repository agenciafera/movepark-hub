// Tabela de taxas para o estacionamento (Operator › Financeiro, 23/11/2026). Lógica pura; o card só
// desenha. Os dados vêm da RPC `partner_fee_table`, que já tira o que não vai ao parceiro (o gateway
// por transação, e o antifraude enquanto nenhuma venda o paga). Spec: docs/specs/taxas-da-reserva.md

import { applyInstallmentOverride, parseInstallmentPolicy, type InstallmentPolicy } from "@/lib/installments";
import { bandFor, parseGatewayFeeSchedule, type GatewayFeeSchedule } from "@/lib/gatewayFees";

export interface PartnerFeeChannel {
  /** Nome da regra de origem; null é o canal padrão (vendas pela Movepark). */
  name: string | null;
  take_rate_bps: number;
  card_fee_payer: string;
  anticipation_payer: string;
  installments_max: number | null;
  installments_interest_free: number | null;
}

export interface PartnerFeeTable {
  pix_bps: number | null;
  card: unknown;
  cet30_bps: unknown;
  antifraud_cents: number | null;
  anticipation_rate_bps: number | null;
  withdrawal_fee_cents: number | null;
  policy: unknown;
  channels: PartnerFeeChannel[];
}

export interface PartnerCardRow {
  installments: number;
  /** Taxa do cartão (MDR), sobre o valor da venda. */
  cardBps: number | null;
  /** Custo de receber em 30 dias menos a taxa do cartão; à vista é zero. */
  anticipationBps: number | null;
  /** Custo total para receber em 30 dias. */
  totalBps: number | null;
}

/** A tabela contratada validada; null quando ainda não foi cadastrada ou está inválida. */
export function partnerSchedule(t: PartnerFeeTable): GatewayFeeSchedule | null {
  return parseGatewayFeeSchedule(
    JSON.stringify({
      version: 1,
      pix_bps: t.pix_bps,
      card: t.card,
      antifraud_cents: t.antifraud_cents ?? 0,
      cet30_bps: t.cet30_bps ?? undefined,
    }),
  );
}

export function cardRows(schedule: GatewayFeeSchedule): PartnerCardRow[] {
  return Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    const cardBps = bandFor(schedule, n)?.bps ?? null;
    const totalBps = schedule.cet30_bps?.[n - 1] ?? null;
    return {
      installments: n,
      cardBps,
      anticipationBps: totalBps != null && cardBps != null ? Math.max(0, totalBps - cardBps) : null,
      totalBps,
    };
  });
}

export function channelLabel(c: PartnerFeeChannel): string {
  return c.name ?? "Vendas pela Movepark";
}

export function payerLabel(payer: string): string {
  return payer === "partner" ? "Você" : "Movepark";
}

/** Parcelamento que o cliente vê no canal: a política da plataforma com o override do canal. */
export function channelInstallments(
  t: PartnerFeeTable,
  c: PartnerFeeChannel,
): { max: number; interestFreeUpTo: number; monthlyInterestPct: number } {
  const policy = parseInstallmentPolicy((t.policy ?? null) as Partial<InstallmentPolicy> | null);
  const eff = applyInstallmentOverride(policy, {
    max: c.installments_max,
    interestFree: c.installments_interest_free,
  });
  return {
    max: eff.maxInstallments,
    interestFreeUpTo: eff.interestFreeUpTo,
    monthlyInterestPct: eff.monthlyInterestPct,
  };
}

export function installmentText(i: { max: number; interestFreeUpTo: number; monthlyInterestPct: number }): string {
  if (i.max <= 1) return "Só à vista.";
  if (i.interestFreeUpTo >= i.max) return `Até ${i.max}x, sem juros.`;
  const pct = i.monthlyInterestPct.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return `Até ${i.max}x. Sem juros até ${i.interestFreeUpTo}x; de ${i.interestFreeUpTo + 1}x em diante o cliente paga juros de ${pct}% ao mês.`;
}
