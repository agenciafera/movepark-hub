// E0.3.1-a · Janela de hold da reserva (config única em `app_setting`). O mesmo valor governa o
// hold da reserva e a validade do QR PIX. Clamp client = clamp server (helpers SQL
// get_booking_hold_minutes/grace) — o servidor é a fonte da verdade, o front só espelha.

export const DEFAULT_BOOKING_HOLD_MINUTES = 30;
export const DEFAULT_BOOKING_HOLD_GRACE_MINUTES = 2;
export const DEFAULT_BOOKING_HOLD_MAX_MINUTES = 90;

export const HOLD_MINUTES_MIN = 5;
export const HOLD_MINUTES_MAX = 1440;
export const GRACE_MINUTES_MIN = 0;
export const GRACE_MINUTES_MAX = 60;
export const MAX_MINUTES_MIN = 10;
export const MAX_MINUTES_MAX = 1440;

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Clampa o hold (minutos) para a faixa válida; NaN → default. */
export function clampHoldMinutes(value: unknown): number {
  return clamp(value, HOLD_MINUTES_MIN, HOLD_MINUTES_MAX, DEFAULT_BOOKING_HOLD_MINUTES);
}

/** Clampa a folga do cron (minutos) para a faixa válida; NaN → default. */
export function clampGraceMinutes(value: unknown): number {
  return clamp(value, GRACE_MINUTES_MIN, GRACE_MINUTES_MAX, DEFAULT_BOOKING_HOLD_GRACE_MINUTES);
}

/** Clampa o teto de renovação (minutos) para a faixa válida; NaN → default. */
export function clampMaxMinutes(value: unknown): number {
  return clamp(value, MAX_MINUTES_MIN, MAX_MINUTES_MAX, DEFAULT_BOOKING_HOLD_MAX_MINUTES);
}

/** Lê o valor cru do app_setting (string) → número clampado; vazio/ausente → default. */
export function parseHoldMinutes(raw: string | null | undefined): number {
  if (raw == null || raw.trim() === "") return DEFAULT_BOOKING_HOLD_MINUTES;
  return clampHoldMinutes(raw);
}

export function parseGraceMinutes(raw: string | null | undefined): number {
  if (raw == null || raw.trim() === "") return DEFAULT_BOOKING_HOLD_GRACE_MINUTES;
  return clampGraceMinutes(raw);
}

export function parseMaxMinutes(raw: string | null | undefined): number {
  if (raw == null || raw.trim() === "") return DEFAULT_BOOKING_HOLD_MAX_MINUTES;
  return clampMaxMinutes(raw);
}
