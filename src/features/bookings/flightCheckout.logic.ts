// Proteção de voo no Operator (25/09/2026): o aviso na reserva e o cálculo do excedente no check-out.
// Spec: docs/superpowers/specs/2026-09-25-protecao-de-voo-cancelamento-design.md

import { formatBRL } from "@/lib/format";
import { overageDays, type ExtensionLike } from "./flightProtection.logic";

export type OperatorExtension = ExtensionLike & { flight_number: string | null; partner_credit_cents?: number | null };

/** O aviso que a portaria lê: motivo, voo, até quando sai sem custo e o preço por dia depois. */
export function flightNotice(e: OperatorExtension, fmt: (iso: string) => string): string {
  const motivo = e.kind === "cancellation" ? "cancelamento" : "atraso";
  const voo = e.flight_number ? `, voo ${e.flight_number}` : "";
  return `Proteção de voo acionada (${motivo}${voo}): sai até ${fmt(e.new_check_out_at)} sem custo. Depois disso, ${formatBRL(e.overage_daily_cents / 100)} por dia, a cobrar no balcão.`;
}

/** Dias além da saída coberta e o valor previsto, pela diária congelada no acionamento. */
export function checkoutPlan(e: ExtensionLike, actualIso: string): { days: number; forecastCents: number } {
  const days = overageDays(e.new_check_out_at, actualIso);
  return { days, forecastCents: days * e.overage_daily_cents };
}

/** A proteção está acionada e a saída real ainda não foi registrada. */
export function awaitingRealCheckout(e: ExtensionLike | null | undefined): boolean {
  return !!e && !e.actual_check_out_at;
}
