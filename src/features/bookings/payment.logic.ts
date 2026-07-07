// Estado de pagamento/estorno derivado dos payments de uma reserva — lógica pura (testável).
// Usado para gatear o botão de estorno e mostrar o badge no Manager/Operator.

type PaymentLike = {
  status: string | null;
  refunded_at: string | null;
  created_at: string;
};

/** Payment mais recente da reserva (por created_at). */
export function lastPayment<T extends PaymentLike>(payments: T[] | null | undefined): T | null {
  if (!payments?.length) return null;
  return [...payments].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

export type PaymentState = {
  /** Pode estornar? (pago e ainda não estornado). */
  canRefund: boolean;
  /** Rótulo do estado de estorno, ou null quando não se aplica. */
  badge: "Estornado" | "Estorno em processamento" | null;
};

/**
 * Deriva o estado de estorno do último payment:
 * - `refunded` → Estornado (não pode estornar de novo);
 * - `paid` + `refunded_at` → PIX estornando (aguardando webhook) — não pode reestornar;
 * - `paid` sem `refunded_at` → pode estornar;
 * - resto (pending/failed/sem payment) → não pode, sem badge.
 */
export function paymentState(payments: PaymentLike[] | null | undefined): PaymentState {
  const p = lastPayment(payments);
  if (!p) return { canRefund: false, badge: null };
  if (p.status === "refunded") return { canRefund: false, badge: "Estornado" };
  if (p.status === "paid" && p.refunded_at) {
    return { canRefund: false, badge: "Estorno em processamento" };
  }
  if (p.status === "paid") return { canRefund: true, badge: null };
  return { canRefund: false, badge: null };
}
