// Proteção de voo: atraso ou cancelamento (25/09/2026). Lógica pura do lado do cliente.
// Spec: docs/superpowers/specs/2026-09-25-protecao-de-voo-cancelamento-design.md
// A verdade mora na RPC extend_booking_flight_delay; aqui é o que a tela mostra antes e depois.

import { formatBRL } from "@/lib/format";
import { FLIGHT_EXTENSION_MAX_HOURS } from "./booking-modifications.logic";

export type FlightKind = "delay" | "cancellation";
export const FLIGHT_KINDS: FlightKind[] = ["delay", "cancellation"];
export const FLIGHT_KIND_LABEL: Record<FlightKind, string> = { delay: "Voo atrasado", cancellation: "Voo cancelado" };

export type ExtensionLike = {
  kind: string;
  new_check_out_at: string;
  requested_check_out_at: string | null;
  overage_daily_cents: number;
  overage_cents: number;
  actual_check_out_at: string | null;
  overage_charged_cents: number | null;
};

/** Saída coberta pela Movepark: a pedida, limitada a 24h depois da atual. */
export function coveredCheckOut(currentIso: string, requestedIso: string, maxHours = FLIGHT_EXTENSION_MAX_HOURS): string {
  const cap = new Date(currentIso).getTime() + maxHours * 3_600_000;
  return new Date(Math.min(cap, new Date(requestedIso).getTime())).toISOString();
}

/** Dias inteiros além da saída coberta (arredonda para cima). Nunca negativo. */
export function overageDays(coveredIso: string, laterIso: string): number {
  const ms = new Date(laterIso).getTime() - new Date(coveredIso).getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function overageForecastCents(coveredIso: string, requestedIso: string, dailyCents: number): number {
  return overageDays(coveredIso, requestedIso) * dailyCents;
}

function kindLabelOf(kind: string): string {
  return FLIGHT_KIND_LABEL[(FLIGHT_KINDS as string[]).includes(kind) ? (kind as FlightKind) : "delay"];
}

/** Uma frase de estado para a reserva do cliente. */
export function protectionSummary(e: ExtensionLike, fmt: (iso: string) => string): string {
  let s = `${kindLabelOf(e.kind)}: saída até ${fmt(e.new_check_out_at)} por nossa conta.`;
  if (e.actual_check_out_at) return `${s} Retirado em ${fmt(e.actual_check_out_at)}.`;
  if (e.overage_cents > 0 && e.requested_check_out_at) {
    s += ` Você pediu até ${fmt(e.requested_check_out_at)}: depois de ${fmt(e.new_check_out_at)}, ${formatBRL(e.overage_daily_cents / 100)} por dia, pago no estacionamento.`;
  }
  return s;
}
