// Lógica pura do cancelamento+estorno (testável sem rede): parsing do payload e a decisão
// de elegibilidade do estorno. A VERDADE da elegibilidade é o servidor (esta função) — o front
// só exibe a política.

/** Janela de cancelamento grátis do cliente (PRD-12): até 24h antes do check-in → reembolso. */
export const FREE_CANCEL_WINDOW_HOURS = 24;

export type Actor = "customer" | "staff";

export type CancelDecision =
  | { action: "cancel_with_refund" }
  | { action: "cancel_no_refund"; reason: "pending" | "not_paid" | "late_window" | "already_refunded" }
  | { action: "noop"; reason: "already_cancelled" | "not_cancelable" };

export interface RefundDecisionArgs {
  actor: Actor;
  bookingStatus: string;
  /** status do último payment do booking (null se não há payment). */
  paymentStatus: string | null;
  /** refunded_at já preenchido (estorno já iniciado/feito). */
  alreadyRefunded: boolean;
  checkInAt: string;
  now: Date;
}

/** true se ainda falta ≥ 24h para o check-in (janela de reembolso grátis do cliente). */
export function withinFreeWindow(checkInAt: string, now: Date): boolean {
  const hours = (new Date(checkInAt).getTime() - now.getTime()) / 3_600_000;
  return hours >= FREE_CANCEL_WINDOW_HOURS;
}

/**
 * Decide o que fazer ao cancelar:
 * - terminal/cancelado → noop (idempotente);
 * - pending → cancela sem estorno (nada pago);
 * - confirmed + pago: staff estorna sempre; cliente estorna só dentro da janela 24h;
 * - confirmed sem pagamento pago / já estornado → cancela sem estorno.
 */
export function refundDecision(a: RefundDecisionArgs): CancelDecision {
  if (a.bookingStatus === "cancelled") return { action: "noop", reason: "already_cancelled" };
  if (a.bookingStatus !== "pending" && a.bookingStatus !== "confirmed") {
    return { action: "noop", reason: "not_cancelable" };
  }
  if (a.bookingStatus === "pending") return { action: "cancel_no_refund", reason: "pending" };

  // confirmed
  if (a.alreadyRefunded) return { action: "cancel_no_refund", reason: "already_refunded" };
  if (a.paymentStatus !== "paid") return { action: "cancel_no_refund", reason: "not_paid" };
  if (a.actor === "staff") return { action: "cancel_with_refund" };
  return withinFreeWindow(a.checkInAt, a.now)
    ? { action: "cancel_with_refund" }
    : { action: "cancel_no_refund", reason: "late_window" };
}

export interface CancelInput {
  bookingCode: string;
  reason: string | null;
}

/** Valida o corpo { booking_code, reason? }. */
export function parseCancelInput(body: unknown): { input: CancelInput | null; error?: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const code = typeof b.booking_code === "string" ? b.booking_code.trim() : "";
  if (!code) return { input: null, error: "booking_code é obrigatório." };
  const reason = typeof b.reason === "string" && b.reason.trim() ? b.reason.trim() : null;
  return { input: { bookingCode: code, reason } };
}
