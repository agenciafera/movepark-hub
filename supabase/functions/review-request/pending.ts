// Lógica pura da coleta pós-estadia. A query SQL já filtra status='completed' e
// review_request_sent_at IS NULL (idempotência); aqui removemos as reservas que
// JÁ têm avaliação (relação review embutida no select). Sem Supabase → testável.

export type BookingRow = {
  id: string;
  review?: Array<{ id: string }> | null;
};

/** Reservas concluídas ainda sem avaliação — alvos do e-mail de pedido. */
export function pendingReviewRequests<T extends BookingRow>(rows: T[] | null | undefined): T[] {
  return (rows ?? []).filter((b) => !(b.review?.length));
}
