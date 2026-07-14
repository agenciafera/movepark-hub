// Lógica pura do cancelamento+estorno (testável sem rede): parsing do payload e a decisão
// de elegibilidade do estorno. A VERDADE da elegibilidade é o servidor (esta função) — o front
// só exibe a política.

/**
 * Janela de cancelamento grátis PADRÃO do cliente (PRD-12): até 24h antes do check-in → reembolso.
 * É o fallback para reservas sem Tarifa snapshot (anteriores à E2.8). Com Tarifa, a verdade é o
 * `fare_cancel_until` gravado na reserva (Básica/Flex = 24h; Superflex = 1 min antes).
 */
export const FREE_CANCEL_WINDOW_HOURS = 24;

export type Actor = "customer" | "staff";

export type CancelDecision =
  | { action: "cancel_with_refund" }
  | { action: "cancel_no_refund"; reason: "pending" | "not_paid" | "already_refunded" }
  // Cliente fora da janela grátis da Tarifa: NÃO cancela (decisão PO jul/2026). Só staff faz override.
  | { action: "blocked"; reason: "late_window" }
  | { action: "noop"; reason: "already_cancelled" | "not_cancelable" };

export interface RefundDecisionArgs {
  actor: Actor;
  bookingStatus: string;
  /** status do último payment do booking (null se não há payment). */
  paymentStatus: string | null;
  /** refunded_at já preenchido (estorno já iniciado/feito). */
  alreadyRefunded: boolean;
  checkInAt: string;
  /** Prazo de cancelamento grátis snapshot da Tarifa (booking.fare_cancel_until). null = sem snapshot. */
  fareCancelUntil?: string | null;
  now: Date;
}

/**
 * Prazo efetivo de cancelamento grátis: o `fare_cancel_until` da Tarifa quando existe (Superflex
 * estende até 1 min antes); senão o fallback padrão de 24h antes do check-in (PRD-12).
 */
export function freeCancelDeadline(checkInAt: string, fareCancelUntil?: string | null): Date {
  if (fareCancelUntil) return new Date(fareCancelUntil);
  return new Date(new Date(checkInAt).getTime() - FREE_CANCEL_WINDOW_HOURS * 3_600_000);
}

/** true se ainda está dentro da janela de reembolso grátis do cliente (agora ≤ prazo da Tarifa). */
export function withinFreeWindow(checkInAt: string, now: Date, fareCancelUntil?: string | null): boolean {
  return now.getTime() <= freeCancelDeadline(checkInAt, fareCancelUntil).getTime();
}

/**
 * Decide o que fazer ao cancelar:
 * - terminal/cancelado → noop (idempotente);
 * - pending → cancela sem estorno (nada pago), a qualquer hora (só libera a vaga);
 * - confirmed + pago: staff estorna sempre (override); cliente estorna só dentro da janela da Tarifa,
 *   e FORA da janela é BLOQUEADO (decisão PO jul/2026 — não cancela mais sem estorno);
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
  return withinFreeWindow(a.checkInAt, a.now, a.fareCancelUntil)
    ? { action: "cancel_with_refund" }
    : { action: "blocked", reason: "late_window" };
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
