// Lógica pura das reservas do cliente. Sem React/Supabase → testável (Vitest).

export type MyBookingStatus =
  | "upcoming" // pending + confirmed futuro
  | "active" // checked_in
  | "history" // completed
  | "cancelled"; // cancelled + no_show + pending expirado

export type BucketableBooking = {
  status: string;
  check_in_at: string;
  check_out_at: string;
  expires_at: string | null;
};

/**
 * Classifica a reserva no bucket exibido na conta do cliente.
 * `now` é injetável para teste; default é o instante atual.
 */
export function bucketBooking(b: BucketableBooking, now: Date = new Date()): MyBookingStatus {
  if (b.status === "checked_in") return "active";
  if (b.status === "completed") return "history";
  if (b.status === "cancelled" || b.status === "no_show") return "cancelled";
  if (b.status === "pending") {
    if (b.expires_at && new Date(b.expires_at) < now) return "cancelled";
    return "upcoming";
  }
  // confirmed
  if (new Date(b.check_out_at) < now) return "history";
  return "upcoming";
}
