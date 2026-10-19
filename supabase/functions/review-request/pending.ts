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

/** Quanto tempo depois da saída ainda faz sentido pedir avaliação. */
export const REVIEW_WINDOW_DAYS = 14;

/** Corte da janela: só pede avaliação de quem saiu depois deste instante. */
export function reviewWindowStartIso(nowMs: number): string {
  return new Date(nowMs - REVIEW_WINDOW_DAYS * 86_400_000).toISOString();
}

export type ReviewContactRow = {
  customer_email?: string | null;
  customer_first_name?: string | null;
  profile?: { first_name?: string | null } | null;
};

/**
 * Para quem vai o pedido. O contato do pedido é o snapshot da reserva (ADR-006); o e-mail da conta
 * é só reforço. Antes lia só o e-mail da conta, e quem entrou pelo WhatsApp (conta sem e-mail)
 * nunca recebia: 11 das 17 reservas concluídas até 19/10/2026 ficaram sem pedido.
 */
export function reviewRecipient(
  b: ReviewContactRow,
  authEmail: string | null | undefined,
): { email: string; firstName: string } | null {
  const email = String(b.customer_email ?? "").trim() || String(authEmail ?? "").trim();
  if (!email) return null;
  const firstName = String(b.customer_first_name ?? "").trim() || String(b.profile?.first_name ?? "").trim() || "cliente";
  return { email, firstName };
}
