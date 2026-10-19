// Regra ÚNICA do que um estorno (ou cancelamento no gateway) faz com a reserva (E0.3.2).
// Um estorno total cancela a reserva SÓ se ela ainda não começou:
//   `confirmed`/`pending` → cancela + libera a vaga (via cancel_booking_with_release).
//   `checked_in`/`completed`/`no_show`/`cancelled` → o estorno reflete só no payment (NÃO cancela).
//   Ex.: reembolso de cortesia numa reserva já usada não deve "cancelar" o histórico.
// E só se o pagamento estornado era o que pagava a reserva e nenhum outro segue pago:
//   - adicional (upgrade de Tarifa, troca de data) devolve só o adicional, a reserva continua paga;
//   - cobrança em dobro (MP-07DAE9, 17/10/2026): estornar a cópia não pode cancelar a reserva que
//     continua paga pela outra cobrança.
// Usada pelo webhook (push) e pelo reconcile-refunds (poll) para não divergirem.
// A própria RPC cancel_booking_with_release recusa status terminal; este guard evita ruído de erro.

export interface RefundBookingContext {
  /** `payment.kind` do pagamento estornado/cancelado. Ausente conta como `booking`. */
  refundedKind?: string | null;
  /** Quantos OUTROS pagamentos da reserva, do tipo `booking`, seguem `paid`/`authorized`. */
  otherLiveBookingPayments?: number;
}

export function refundShouldCancelBooking(
  bookingStatus: string | null | undefined,
  ctx: RefundBookingContext = {},
): boolean {
  if (bookingStatus !== "confirmed" && bookingStatus !== "pending") return false;
  if (ctx.refundedKind && ctx.refundedKind !== "booking") return false;
  if ((ctx.otherLiveBookingPayments ?? 0) > 0) return false;
  return true;
}

/**
 * Conta os outros pagamentos da reserva que ainda a sustentam (tipo `booking`, `paid` ou
 * `authorized`), excluindo o que acabou de ser estornado/cancelado. Em erro de leitura devolve 1:
 * na dúvida, não cancela uma reserva que pode estar paga.
 */
export async function countOtherLiveBookingPayments(
  // deno-lint-ignore no-explicit-any
  admin: any,
  bookingId: string,
  paymentId: string,
): Promise<number> {
  const { count, error } = await admin
    .from("payment")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId)
    .eq("kind", "booking")
    .in("status", ["paid", "authorized"])
    .neq("id", paymentId);
  if (error) {
    console.error("[refund] não consegui contar os pagamentos da reserva:", bookingId, error.message);
    return 1;
  }
  return count ?? 0;
}
