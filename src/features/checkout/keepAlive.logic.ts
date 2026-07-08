// Lógica pura do modal keep-alive "Ainda está aí?" (E0.3.1-b). Decide QUANDO o modal aparece e
// se o teto de renovação já foi atingido — sem React, testável.
import { DEFAULT_BOOKING_HOLD_MAX_MINUTES } from "@/lib/bookingHold";

/** Minutos antes do fim em que o modal começa a avisar (proposta da tarefa: 5). */
export const KEEP_ALIVE_THRESHOLD_SEC = 5 * 60;

export type KeepAliveState = "hidden" | "warning" | "cap" | "expired";

/**
 * Estado do modal a partir da reserva e do "agora":
 * - `hidden`  — não pendente, sem expiração, ou ainda falta mais que o limiar;
 * - `warning` — dentro do limiar (≤5 min) e ainda dá pra renovar → mostra o CTA;
 * - `cap`     — dentro do limiar mas o teto (created_at + máx) já passou → não dá pra renovar;
 * - `expired` — já passou de `expires_at`.
 */
export function keepAliveState(args: {
  status: string;
  expiresAt: string | null;
  createdAt: string | null;
  nowMs: number;
  /** Teto de renovação (min) — vindo de `booking_hold_max_minutes`; default 90. */
  maxMinutes?: number;
}): KeepAliveState {
  const { status, expiresAt, createdAt, nowMs } = args;
  const maxMinutes = args.maxMinutes ?? DEFAULT_BOOKING_HOLD_MAX_MINUTES;
  if (status !== "pending" || !expiresAt) return "hidden";

  const expMs = new Date(expiresAt).getTime();
  if (nowMs >= expMs) return "expired";

  const secsLeft = Math.floor((expMs - nowMs) / 1000);
  if (secsLeft > KEEP_ALIVE_THRESHOLD_SEC) return "hidden";

  if (createdAt) {
    const capMs = new Date(createdAt).getTime() + maxMinutes * 60_000;
    if (nowMs >= capMs) return "cap";
  }
  return "warning";
}
