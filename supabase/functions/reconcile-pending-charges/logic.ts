// Lógica pura de reconcile-pending-charges (testável sem rede).
//
// O buraco que ela fecha: as duas redes de segurança que existiam partem de um pagamento que JÁ
// está `paid` no nosso banco (reconcile-confirmations) ou de um estorno já pedido
// (reconcile-refunds). Nenhuma olha o pagamento que ficou em `pending` para sempre. Se o webhook
// `charge.paid` se perde, a reserva expira pelo cron e o pagamento fica pendente eternamente: se o
// cliente pagou, recebemos dinheiro que ninguém no sistema sabe que entrou.
//
// Aqui a pergunta é ao contrário: nosso banco diz pendente, e o gateway, o que diz?

import type { ChargeStatus } from "../_shared/payments/types.ts";

/** Cada item é uma chamada ao gateway. Lote pequeno porque a fila normal é vazia. */
export const BATCH_LIMIT = 50;

/**
 * Só olha pagamento parado há mais de N min. Abaixo disso ele é apenas um PIX recente esperando o
 * cliente, e o webhook ainda é o caminho normal.
 */
export const CUTOFF_MINUTES = 60;

/**
 * Margem depois do vencimento antes de dar a cobrança por morta. O relógio do gateway não é o
 * nosso, e o `charge.paid` de um pagamento no último segundo pode chegar depois do vencimento.
 */
export const GRACE_MINUTES = 15;

export function pendingCutoffIso(nowMs: number): string {
  return new Date(nowMs - CUTOFF_MINUTES * 60_000).toISOString();
}

export type AcaoPendente =
  | { tipo: "esperar"; motivo: string }
  | { tipo: "pagar" }
  | { tipo: "encerrar"; status: "failed" | "cancelled" | "refunded"; motivo: string };

/**
 * O que fazer com um pagamento que o nosso banco tem como pendente, à luz do que o gateway
 * respondeu.
 *
 * Três regras que o formato protege:
 *
 * 1. **Erro de consulta nunca encerra linha.** Não conseguir perguntar não é o mesmo que ouvir
 *    "não foi pago". Marcar `failed` aqui esconderia para sempre um pagamento recebido, que é
 *    exatamente o dano que esta rotina existe para evitar. Vale para 5xx, rate limit, rede caída e
 *    também para 401: chave errada devolveria "morreu tudo".
 * 2. **Cartão em análise espera.** `authorized` é dinheiro comprometido, não recusado.
 * 3. **Pendente só morre depois de vencer, com margem.** Enquanto a cobrança é válida, pendente é o
 *    estado certo, e o cliente ainda pode pagar.
 */
export function decidirPagamentoPendente(input: {
  httpStatus: number | null;
  chargeStatus: ChargeStatus | null;
  expiresAt: string | null;
  nowMs: number;
}): AcaoPendente {
  const http = input.httpStatus ?? 0;

  // 404: a ordem não existe no gateway. Acontece quando a criação falhou no meio e gravamos um id
  // que nunca virou cobrança. Sem validade vencida, espera (pode ser propagação).
  if (http === 404) {
    return venceu(input.expiresAt, input.nowMs)
      ? { tipo: "encerrar", status: "failed", motivo: "cobranca inexistente no gateway" }
      : { tipo: "esperar", motivo: "nao encontrada ainda" };
  }
  if (http < 200 || http >= 300) {
    return { tipo: "esperar", motivo: `consulta falhou (HTTP ${input.httpStatus ?? "sem resposta"})` };
  }

  switch (input.chargeStatus) {
    case "paid":
      return { tipo: "pagar" };
    case "refunded":
      return { tipo: "encerrar", status: "refunded", motivo: "estornada no gateway" };
    case "failed":
      return { tipo: "encerrar", status: "failed", motivo: "recusada no gateway" };
    case "canceled":
      return { tipo: "encerrar", status: "cancelled", motivo: "cancelada no gateway" };
    case "authorized":
      return { tipo: "esperar", motivo: "autorizada, aguardando captura" };
    default:
      return venceu(input.expiresAt, input.nowMs)
        ? { tipo: "encerrar", status: "failed", motivo: "validade vencida sem pagamento" }
        : { tipo: "esperar", motivo: "cobranca ainda vale" };
  }
}

/** Vencida com margem. Validade ausente ou ilegível conta como NÃO vencida (o seguro é esperar). */
export function venceu(expiresAt: string | null, nowMs: number): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return false;
  return nowMs > t + GRACE_MINUTES * 60_000;
}

/** Portão da chave interna: sem chave conhecida no Vault, ninguém entra. */
export function autorizado(
  esperado: string | null | undefined,
  recebido: string | null,
): boolean {
  if (!esperado) return false;
  return recebido === esperado;
}
