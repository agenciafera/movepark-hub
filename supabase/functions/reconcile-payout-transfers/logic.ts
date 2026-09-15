// Lógica pura de reconcile-payout-transfers (testável sem rede).

import {
  nextTransferRowStatus,
  type TransferRowStatus,
} from "../_shared/payments/transfer.ts";

/** Cada item é uma chamada ao gateway; a rota de transferências tem rate limit apertado. */
export const BATCH_LIMIT = 20;

/**
 * Status novo da linha a partir da consulta ao gateway, ou `null` se não deve escrever. Erro ao
 * consultar nunca vira falha: não saber o status não é saber que o repasse falhou, e marcar
 * `failed` liberaria a empresa para um segundo repasse do mesmo dinheiro.
 */
export function decideReconcileTransfer(input: {
  current: string;
  httpStatus: number | null;
  rawStatus: string | null;
}): TransferRowStatus | null {
  const http = input.httpStatus ?? 0;
  if (http < 200 || http >= 300) return null;
  return nextTransferRowStatus(input.current, input.rawStatus);
}
