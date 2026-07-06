// Lógica pura do estorno avulso (testável sem rede): parsing do payload e a decisão de
// elegibilidade. Estorno é uma ação de STAFF (Manager/Operator), separada do cancelamento —
// NÃO muda o status da reserva. A verdade da elegibilidade é o servidor (esta função).

export interface RefundInput {
  bookingCode: string;
  reason: string | null;
}

/** Valida o corpo { booking_code, reason? }. */
export function parseRefundInput(body: unknown): { input: RefundInput | null; error?: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const code = typeof b.booking_code === "string" ? b.booking_code.trim() : "";
  if (!code) return { input: null, error: "booking_code é obrigatório." };
  const reason = typeof b.reason === "string" && b.reason.trim() ? b.reason.trim() : null;
  return { input: { bookingCode: code, reason } };
}

export type RefundDecision =
  | { action: "refund" }
  | { action: "noop"; reason: "already_refunded" }
  | { action: "reject"; reason: "no_payment" | "not_paid" };

/**
 * Decide se o estorno avulso pode prosseguir a partir do último payment da reserva:
 * - sem payment → reject (nada a estornar);
 * - já estornado (`refunded_at`) → noop (idempotente);
 * - payment não está `paid` → reject;
 * - senão → refund.
 * Independe do status da RESERVA — permite estornar até reserva concluída.
 */
export function refundDecision(args: {
  paymentStatus: string | null;
  alreadyRefunded: boolean;
}): RefundDecision {
  if (args.paymentStatus == null) return { action: "reject", reason: "no_payment" };
  if (args.alreadyRefunded) return { action: "noop", reason: "already_refunded" };
  if (args.paymentStatus !== "paid") return { action: "reject", reason: "not_paid" };
  return { action: "refund" };
}
