// Status e datas do SAQUE (`payout_withdrawal`), agnóstico ao gateway (E0.3.10). Uma regra só
// para quem escreve a linha: a Edge que pede o saque, o webhook `transfer.*` e a conciliação.

import type { TransferResult } from "./types.ts";

export type WithdrawalStatus = "created" | "processing" | "paid" | "failed" | "canceled";

const TERMINAIS = new Set<string>(["paid", "failed", "canceled"]);

/** Status cru da transferência → status normalizado do saque. */
export function transferStatusToWithdrawalStatus(raw: string | null | undefined): WithdrawalStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "paid":
    case "transferred":
      return "paid";
    case "failed":
    case "with_error":
      return "failed";
    case "canceled":
    case "cancelled":
      return "canceled";
    case "processing":
    case "pending_transfer":
    case "pending":
      return "processing";
    case "created":
    case "":
    default:
      return "created";
  }
}

/**
 * Para onde a linha vai com um status cru novo, ou null se não deve mudar. Terminal nunca muda
 * (leitura fora de ordem não reabre saque pago) e `created` não rebaixa `processing`.
 */
export function nextWithdrawalStatus(
  current: string | null | undefined,
  raw: string | null | undefined,
): WithdrawalStatus | null {
  if (current && TERMINAIS.has(current)) return null;
  const next = transferStatusToWithdrawalStatus(raw);
  if (next === current) return null;
  if (next === "created" && current === "processing") return null;
  return next;
}

const BRT_OFFSET_MIN = -180;

/** Componentes de uma data no fuso de Brasília (sem horário de verão desde 2019). */
function brt(d: Date) {
  const shifted = new Date(d.getTime() + BRT_OFFSET_MIN * 60_000);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    weekday: shifted.getUTCDay(),
  };
}

/** Meia-noite de Brasília do dia (y, m, d), em UTC. */
function brtMidnightUtc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d) - BRT_OFFSET_MIN * 60_000);
}

/**
 * Previsão de crédito quando o gateway não devolve `funding_estimated_date`. Regra da Pagar.me
 * para saque manual: pedido até as 15h de Brasília em dia útil cai no mesmo dia; depois disso, ou
 * em fim de semana, cai no próximo dia útil. Feriado não entra (o gateway sabe; nós não): quando
 * ele devolve a data, ela prevalece. Devolve o fim do dia útil (23:59 BRT), para "atrasado" só
 * acender no dia seguinte.
 */
export function expectedFundingDate(requestedAt: Date): string {
  const t = brt(requestedAt);
  let day = brtMidnightUtc(t.y, t.m, t.d);
  const sameDay = t.weekday >= 1 && t.weekday <= 5 && t.hour < 15;
  if (!sameDay) {
    day = new Date(day.getTime() + 86_400_000);
    while (brt(day).weekday === 0 || brt(day).weekday === 6) {
      day = new Date(day.getTime() + 86_400_000);
    }
  }
  return new Date(day.getTime() + 86_400_000 - 60_000).toISOString();
}

/**
 * O que gravar na linha do saque a partir de uma leitura do gateway (resposta do POST, webhook ou
 * GET de conciliação). `current` é o status da linha hoje; sem ele (linha nova) não há o que
 * proteger. Erro HTTP não escreve nada: não saber o status não é saber que falhou.
 */
export function withdrawalPatch(input: {
  result: TransferResult;
  nowIso: string;
  current?: string | null;
}): Record<string, unknown> | null {
  const http = input.result.httpStatus ?? 0;
  if (http < 200 || http >= 300) return null;
  const patch: Record<string, unknown> = {
    gateway_status: input.result.status ?? null,
    synced_at: input.nowIso,
    raw: input.result.raw ?? null,
  };
  if (input.result.fundingEstimatedDate) patch.expected_at = input.result.fundingEstimatedDate;
  const next = input.current
    ? nextWithdrawalStatus(input.current, input.result.status)
    : transferStatusToWithdrawalStatus(input.result.status);
  if (next) {
    patch.status = next;
    if (next === "paid") patch.paid_at = input.result.fundingDate ?? input.nowIso;
    if (next === "failed" || next === "canceled") {
      patch.failure_reason = input.result.bankResponse ?? `gateway: ${input.result.status ?? next}`;
    }
  } else if (input.result.fundingDate && (input.current === "paid")) {
    patch.paid_at = input.result.fundingDate;
  }
  const aberto = (patch.status ?? input.current ?? "created") as string;
  if (!patch.expected_at && !input.current && (aberto === "created" || aberto === "processing")) {
    patch.expected_at = expectedFundingDate(new Date(input.nowIso));
  }
  return patch;
}
