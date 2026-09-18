// Lógica pura de retry-refund (testável sem rede): validação do corpo e a resposta por desfecho.

import type { RefundOutcome } from "../_shared/payments/refund.ts";

/** Valida `{ manual_refund_id }`. */
export function parseRetryInput(body: unknown): { id: string | null; error?: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const id = typeof b.manual_refund_id === "string" && b.manual_refund_id.trim() ? b.manual_refund_id.trim() : null;
  return id ? { id } : { id: null, error: "manual_refund_id é obrigatório." };
}

/** Pode tentar de novo? Só linha pendente de pagamento que ainda não foi estornado. */
export function retryPreflight(fila: { status: string } | null, payment: { status: string } | null): { ok: boolean; status: number; error?: string } {
  if (!fila) return { ok: false, status: 404, error: "Linha da fila não encontrada." };
  if (fila.status !== "pending") return { ok: false, status: 409, error: "Essa devolução já foi resolvida." };
  if (!payment) return { ok: false, status: 404, error: "Pagamento não encontrado." };
  if (payment.status === "refunded") return { ok: false, status: 409, error: "Esse pagamento já está estornado." };
  return { ok: true, status: 200 };
}

/**
 * O que responder por desfecho do gateway. Incerteza (timeout, 5xx) não toca em nada e pede nova
 * tentativa; recusa processada devolve o motivo e mantém a linha pendente; sucesso fecha a linha.
 */
export function retryResponse(
  outcome: RefundOutcome,
  result: { status: string; failureMessages?: string[] },
): { http: number; body: Record<string, unknown>; closeQueue: boolean } {
  if (outcome === "transient") {
    return { http: 502, body: { error: "O gateway não respondeu. Tente de novo em instantes." }, closeQueue: false };
  }
  if (outcome === "definitive") {
    const motivo = (result.failureMessages ?? []).join("; ") || "sem motivo informado";
    return { http: 409, body: { error: `O gateway recusou de novo: ${motivo}` }, closeQueue: false };
  }
  const refundPending = result.status !== "refunded";
  return { http: 200, body: { ok: true, status: refundPending ? "paid" : "refunded", refund_pending: refundPending }, closeQueue: true };
}
