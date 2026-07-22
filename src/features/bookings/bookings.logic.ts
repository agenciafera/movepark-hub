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

/**
 * Nome do cliente do pedido, para o operador/manager.
 *
 * Vem do SNAPSHOT da booking (`customer_name`), não do `profile.full_name`
 * (ADR-006: o contato operacional mora no snapshot). O bug que isto corrige:
 * a tabela lia `profile.full_name`, que é null em conta sem nome preenchido,
 * então uma reserva com "Test Pentest" no snapshot aparecia como vazia.
 * `full_name` fica só de fallback para reservas antigas sem snapshot.
 */
export function bookingCustomerName(b: {
  customer_name?: string | null;
  customer_first_name?: string | null;
  customer_last_name?: string | null;
  profile?: { full_name?: string | null } | null;
}): string | null {
  const doSnapshot =
    b.customer_name?.trim() ||
    [b.customer_first_name, b.customer_last_name].filter(Boolean).join(" ").trim();
  return doSnapshot || b.profile?.full_name?.trim() || null;
}
