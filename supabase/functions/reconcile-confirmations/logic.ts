// Lógica pura do reconcile-confirmations (testável sem rede): o portão da chave, a janela
// de reavaliação e o que fazer com o desfecho que a RPC devolve.
//
// Esta rotina é a rede de segurança do webhook `paid`: ela pega pagamento pago cuja reserva
// não confirmou. Um dos desfechos possíveis é ESTORNAR no gateway, então a decisão aqui
// move dinheiro de verdade e merece estar isolada e coberta.

/** Só reconcilia pagamento confirmado há mais de N min (dá tempo do webhook chegar primeiro). */
export const CUTOFF_MINUTES = 10;

/** Teto de pagamentos reavaliados por execução. */
export const BATCH_LIMIT = 100;

/**
 * Corte da janela. Recebe o "agora" em ms para ser determinística no teste.
 */
export function confirmationCutoffIso(nowMs: number): string {
  return new Date(nowMs - CUTOFF_MINUTES * 60_000).toISOString();
}

/**
 * Portão da chave interna. Aqui a chave esperada vem do Vault por RPC, então ela pode voltar
 * nula (Vault fora do ar, segredo removido). Nesse caso a rotina recusa: sem chave conhecida
 * não há como distinguir o cron de qualquer um.
 */
export function autorizado(
  esperado: string | null | undefined,
  recebido: string | null,
): boolean {
  if (!esperado) return false;
  return recebido === esperado;
}

export type Acao =
  | { tipo: "nada" }
  | { tipo: "confirmar" }
  | { tipo: "estornar"; chargeId: string };

/**
 * Traduz o desfecho da RPC `confirm_or_refund_booking` em ação.
 *
 * Três coisas que o formato protege:
 *
 * 1. Desfecho desconhecido não cai no estorno. O `else if` do código antigo já fazia isso,
 *    mas um `switch` malfeito no futuro faria, e estorno é irreversível do lado do parceiro.
 * 2. `needs_refund` sem charge id nenhum vira `nada`, não uma chamada ao gateway com
 *    `undefined`, que estornaria o que o gateway resolvesse casar.
 * 3. O charge id preferido é o que a RPC devolveu, com o do pagamento como reserva. A ordem
 *    importa: a RPC olhou a linha agora, o campo do pagamento pode estar velho.
 */
export function decidirAcao(
  outcome: string | null | undefined,
  chargeIdDaRpc: string | null | undefined,
  chargeIdDoPagamento: string | null | undefined,
): Acao {
  if (outcome === "needs_refund") {
    const chargeId = chargeIdDaRpc ?? chargeIdDoPagamento;
    return chargeId ? { tipo: "estornar", chargeId } : { tipo: "nada" };
  }
  if (outcome === "confirmed" || outcome === "reconfirmed") {
    return { tipo: "confirmar" };
  }
  return { tipo: "nada" };
}
