// Estado de pagamento/estorno derivado dos payments de uma reserva: lógica pura (testável).
// Usado para mostrar o badge de estorno (Estornado / em processamento) no Manager/Operator.
// (O estorno não é mais uma ação à parte: reembolsar = cancelar antes do check-in — E0.3.2.)

type PaymentLike = {
  status: string | null;
  refunded_at?: string | null;
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

// ── Janela de estorno do gateway (17/09/2026) ────────────────────────────────
//
// A Pagar.me só estorna pela API dentro de um prazo contado do PAGAMENTO: PIX até 90 dias,
// cartão até 180. Passou, ela recusa com ou sem saldo, e o cancelamento cai na fila de reembolso
// manual do Manager. A tela avisa antes de a equipe clicar. Os prazos são os verificados na
// documentação em 15/09/2026; se a Pagar.me mudar, é aqui que se muda.

export const REFUND_WINDOW_DAYS: Record<string, number> = { pix: 90, card: 180 };

export type RefundWindow = {
  /** Data limite para o gateway aceitar o estorno. */
  deadline: Date;
  /** Já passou? */
  expired: boolean;
  /** Dias que faltam (negativo quando venceu). */
  daysLeft: number;
  method: "pix" | "card";
};

/** Janela de estorno do pagamento pago mais recente, ou null quando não há pago/método conhecido. */
export function refundWindow(
  payments: { status: string | null; paid_at?: string | null; method?: string | null; created_at: string }[] | null | undefined,
  now: Date = new Date(),
): RefundWindow | null {
  const p = lastPayment(payments ?? []);
  if (!p || p.status !== "paid" || !p.paid_at) return null;
  const method = p.method === "pix" || p.method === "card" ? p.method : null;
  if (!method) return null;
  const days = REFUND_WINDOW_DAYS[method];
  const deadline = new Date(Date.parse(p.paid_at) + days * 86_400_000);
  const daysLeft = Math.floor((deadline.getTime() - now.getTime()) / 86_400_000);
  return { deadline, expired: daysLeft < 0, daysLeft, method };
}
