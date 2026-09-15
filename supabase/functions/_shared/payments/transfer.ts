// Status do repasse ao parceiro (`payout_transfer`), agnóstico ao gateway. Uma regra só para quem
// escreve o status: a Edge que dispara, o webhook `transfer.*` e a conciliação por polling. Duas
// cópias dessa decisão seria o jeito mais fácil de uma fechar como pago o que a outra reabre.

/** Status da linha em `payout_transfer` depois de ir ao gateway (sem o `created`). */
export type TransferRowStatus = "processing" | "paid" | "failed" | "canceled";

const TERMINAIS = new Set(["paid", "failed", "canceled"]);

/**
 * Status cru da transferência para o status da linha. Terminal de falha libera a empresa: em
 * `processing` a linha conta como repassado e ocupa o índice de um repasse em andamento.
 * Desconhecido fica em `processing`, nunca em `paid` por chute.
 */
export function transferRowStatus(raw: string | null | undefined): TransferRowStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "transferred":
    case "paid":
      return "paid";
    case "failed":
    case "with_error":
      return "failed";
    case "canceled":
    case "cancelled":
      return "canceled";
    default:
      return "processing";
  }
}

/**
 * Para onde a linha vai com um novo status cru, ou `null` se não deve escrever. Terminal nunca muda
 * (evento fora de ordem não reabre repasse pago), e o que não avança não escreve.
 */
export function nextTransferRowStatus(
  current: string,
  raw: string | null | undefined,
): TransferRowStatus | null {
  if (TERMINAIS.has(current)) return null;
  const next = transferRowStatus(raw);
  return next === current ? null : next;
}
