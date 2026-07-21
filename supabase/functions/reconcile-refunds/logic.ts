// Lógica pura do reconcile-refunds (testável sem rede): a janela de reavaliação e a decisão por
// pagamento. A rede de segurança do estorno (poll) só age quando o webhook (push) não chegou, então
// vale ter a decisão isolada e coberta.

import { refundShouldCancelBooking } from "../_shared/refund.ts";

/** Só reavalia estornos iniciados há mais de N min (dá tempo do fluxo assíncrono do PIX + webhook). */
export const CUTOFF_MINUTES = 15;

/** Teto de pagamentos reavaliados por execução (o cron roda a cada 15 min). */
export const BATCH_LIMIT = 100;

/**
 * Corte da janela: um estorno só entra no lote se foi iniciado (refunded_at) antes deste instante.
 * Recebe o "agora" em ms para ser determinística no teste.
 */
export function refundCutoffIso(nowMs: number): string {
  return new Date(nowMs - CUTOFF_MINUTES * 60_000).toISOString();
}

/** O que fazer com um pagamento reavaliado, dado o status no gateway e o status da reserva. */
export interface ReconcileAction {
  /** Gravar o payment como refunded (o gateway confirmou o estorno). */
  markRefunded: boolean;
  /** Cancelar a reserva e liberar a vaga (estorno total sobre reserva ainda não iniciada). */
  cancelBooking: boolean;
}

/**
 * Decide a ação a partir do status no gateway e do status da reserva.
 *
 * Só age quando o gateway diz `refunded`; qualquer outro status é ruído do poll (o estorno ainda não
 * fechou) e não mexe em nada. O cancelamento segue a regra ÚNICA de refundShouldCancelBooking, a
 * mesma do webhook, então poll e push não divergem: reserva já cancelada não é cancelada de novo
 * (idempotente), e reserva já iniciada só reflete no payment.
 */
export function decideReconcileAction(
  chargeStatus: string | null | undefined,
  bookingStatus: string | null | undefined,
): ReconcileAction {
  if (chargeStatus !== "refunded") {
    return { markRefunded: false, cancelBooking: false };
  }
  return { markRefunded: true, cancelBooking: refundShouldCancelBooking(bookingStatus) };
}
