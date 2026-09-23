// Lógica pura de booking-reminders: as janelas dos lembretes.
//
// O lembrete de entrada sai quando o check-in está a até 24h; o de retirada, quando a saída está a
// até 2h. A idempotência é do `notification_log` (um por reserva e evento), então a janela pode ser
// larga: o cron passa a cada 15 min e manda uma vez só.

export const CHECKIN_AHEAD_HOURS = 24;
export const CHECKOUT_AHEAD_HOURS = 2;

export function reminderWindows(nowMs: number): { checkinUntil: string; checkoutUntil: string; now: string } {
  return {
    now: new Date(nowMs).toISOString(),
    checkinUntil: new Date(nowMs + CHECKIN_AHEAD_HOURS * 3_600_000).toISOString(),
    checkoutUntil: new Date(nowMs + CHECKOUT_AHEAD_HOURS * 3_600_000).toISOString(),
  };
}

/** Só quem ainda não recebeu aquele evento entra (o log diz). */
export function pendingFor<T extends { id: string }>(rows: T[], sentBookingIds: Set<string>): T[] {
  return rows.filter((r) => !sentBookingIds.has(r.id));
}
