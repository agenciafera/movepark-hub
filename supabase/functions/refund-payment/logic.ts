// Lógica pura do refund-payment (testável sem rede): validação do corpo, quando dá para estornar
// e a resposta por desfecho do gateway.

import type { RefundOutcome } from "../_shared/payments/refund.ts";

export const REASON_MIN = 5;
export const REASON_MAX = 300;

/** Valida `{ payment_id, reason }`. O motivo é obrigatório: é ele que explica o estorno no relatório. */
export function parseRefundInput(body: unknown): { paymentId: string | null; reason: string | null; error?: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const paymentId = typeof b.payment_id === "string" && b.payment_id.trim() ? b.payment_id.trim() : null;
  const reason = typeof b.reason === "string" ? b.reason.trim().replace(/\s+/g, " ") : "";
  if (!paymentId) return { paymentId: null, reason: null, error: "payment_id é obrigatório." };
  if (reason.length < REASON_MIN) {
    return { paymentId: null, reason: null, error: "Escreva o motivo do estorno (ex.: cobrança em dobro)." };
  }
  if (reason.length > REASON_MAX) {
    return { paymentId: null, reason: null, error: `O motivo passa de ${REASON_MAX} caracteres.` };
  }
  return { paymentId, reason };
}

export interface RefundablePaymentRow {
  provider: string | null;
  status: string;
  refunded_at: string | null;
}

/** Dá para estornar este pagamento agora? */
export function refundPreflight(
  payment: RefundablePaymentRow | null,
  hasPendingManualRefund: boolean,
): { ok: boolean; status: number; error?: string } {
  if (!payment) return { ok: false, status: 404, error: "Pagamento não encontrado." };
  if (payment.status === "refunded") return { ok: false, status: 409, error: "Esse pagamento já está estornado." };
  if (payment.status !== "paid") {
    return { ok: false, status: 409, error: "Só dá para estornar pagamento aprovado." };
  }
  if (payment.refunded_at) {
    return { ok: false, status: 409, error: "Esse pagamento já tem um estorno em andamento." };
  }
  if (hasPendingManualRefund) {
    return { ok: false, status: 409, error: "Esse estorno já está na fila manual, em Financeiro › Repasses." };
  }
  if ((payment.provider ?? "pagarme") !== "pagarme") {
    return { ok: false, status: 422, error: "Só dá para estornar por aqui pagamento feito na Pagar.me." };
  }
  return { ok: true, status: 200 };
}

/** O motivo como fica gravado no pagamento e no rastro. */
export function refundReasonText(reason: string): string {
  return `estorno avulso (reserva mantida): ${reason}`;
}

/**
 * O que responder por desfecho do gateway. Incerteza (timeout, 5xx) não muda nada e pede nova
 * tentativa; recusa processada vai para a fila manual; sucesso grava o estorno.
 */
export function refundResponse(
  outcome: RefundOutcome,
  result: { status: string; failureMessages?: string[] },
): { http: number; body: Record<string, unknown> } {
  if (outcome === "transient") {
    return { http: 502, body: { error: "A Pagar.me não respondeu. Confira no rastro antes de tentar de novo." } };
  }
  if (outcome === "definitive") {
    const motivo = (result.failureMessages ?? []).join("; ") || "sem motivo informado";
    return {
      http: 409,
      body: { error: `A Pagar.me recusou o estorno (${motivo}). Ele foi para a fila manual, em Financeiro › Repasses.`, manual: true },
    };
  }
  const refundPending = result.status !== "refunded";
  return { http: 200, body: { ok: true, status: refundPending ? "paid" : "refunded", refund_pending: refundPending } };
}
