// Regra ÚNICA do estorno TOTAL sobre a reserva (E0.3.2).
// Um estorno total cancela a reserva SÓ se ela ainda não começou:
//   `confirmed`/`pending` → cancela + libera a vaga (via cancel_booking_with_release).
//   `checked_in`/`completed`/`no_show`/`cancelled` → o estorno reflete só no payment (NÃO cancela) —
//   ex.: reembolso de cortesia numa reserva já usada não deve "cancelar" o histórico.
// Usada pelo webhook (push) e pelo reconcile-refunds (poll) para não divergirem.
// A própria RPC cancel_booking_with_release recusa status terminal; este guard evita ruído de erro.
export function refundShouldCancelBooking(bookingStatus: string | null | undefined): boolean {
  return bookingStatus === "confirmed" || bookingStatus === "pending";
}
