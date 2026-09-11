// Validade da cobrança PIX = janela de hold da reserva (E0.3.1-a). É UM relógio só: o mesmo
// `app_setting.booking_hold_minutes` que governa `booking.expires_at` governa o `expires_in` da
// order. Duas fontes separadas foi o que deixava dinheiro capturado sem vaga do outro lado.
//
// A faixa e o default espelham a RPC `get_booking_hold_minutes()` (greatest(5, least(1440, …)),
// default 30). Espelhar aqui importa porque a RPC pode não responder, e um `Number(undefined)`
// viraria `NaN` no `expires_in` da cobrança.

/** Default da `get_booking_hold_minutes()` quando a chave não existe. */
export const HOLD_MINUTES_FALLBACK = 30;
const HOLD_MINUTES_MIN = 5;
const HOLD_MINUTES_MAX = 1440;

/** Minutos de hold (resposta da RPC, de qualquer forma) → segundos de validade da cobrança. */
export function pixExpiresInSeconds(holdMinutes: unknown): number {
  // Ausência (RPC sem resposta) cai no default; valor presente é apertado, inclusive o zero, que
  // no Postgres já viraria 5 pelo `greatest`. Sem separar os dois, `Number(null)` daria 0 e o
  // default sumiria justamente quando a RPC falhou.
  const parsed = holdMinutes == null ? Number.NaN : Number(holdMinutes);
  const minutes = Number.isFinite(parsed) ? parsed : HOLD_MINUTES_FALLBACK;
  return Math.min(HOLD_MINUTES_MAX, Math.max(HOLD_MINUTES_MIN, Math.round(minutes))) * 60;
}
