// Lógica pura de create-payout-transfer (testável sem rede): parsing do pedido e pré-voo de saldo.

export interface TransferRequest {
  companyId: string;
  amountCents: number;
}

/**
 * Valida `{ company_id, amount_cents }`. O valor é conferência, não fonte: quem manda no quanto é a
 * RPC `payout_transfer_request`, que recalcula o devido no servidor. Ainda assim a forma é checada
 * aqui, para um "7650" em string ou um centavo fracionado não chegar ao gateway.
 */
export function parseTransferInput(
  body: unknown,
): { input: TransferRequest | null; error?: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const companyId = typeof b.company_id === "string" ? b.company_id.trim() : "";
  if (!companyId) return { input: null, error: "company_id é obrigatório." };
  if (b.amount_cents == null) return { input: null, error: "amount_cents é obrigatório." };
  const amount = b.amount_cents;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
    return { input: null, error: "amount_cents tem que ser inteiro positivo, em centavos." };
  }
  return { input: { companyId, amountCents: amount } };
}

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Pré-voo de saldo no recebedor master. Saldo desconhecido barra: melhor recusar com motivo do que
 * mandar um repasse que o gateway vai recusar, deixando uma linha pendurada em `created`.
 */
export function decidePreflight(input: {
  amountCents: number;
  availableCents: number | null;
}): { ok: boolean; reason?: string } {
  const { amountCents, availableCents } = input;
  if (availableCents == null) {
    return { ok: false, reason: "Não consegui ler o saldo da conta da Movepark no gateway." };
  }
  if (availableCents < amountCents) {
    return {
      ok: false,
      reason:
        `Saldo insuficiente na conta da Movepark: faltam R$ ${brl(amountCents - availableCents)} ` +
        `(disponível R$ ${brl(availableCents)}).`,
    };
  }
  return { ok: true };
}

// ── O que a linha vira depois da resposta do gateway ────────────────────────

import { type TransferRowStatus, transferRowStatus } from "../_shared/payments/transfer.ts";
export { type TransferRowStatus, transferRowStatus };

export type TransferOutcome =
  /** O gateway aceitou e devolveu id. */
  | { kind: "sent"; rowStatus: TransferRowStatus }
  /** O gateway processou e recusou: nada saiu, a linha falha e a empresa fica livre. */
  | { kind: "rejected" }
  /** Não dá para saber se o dinheiro saiu. A linha fica para retentar com a MESMA chave. */
  | { kind: "uncertain" };

/**
 * Classifica a resposta de `POST /transfers`. A pergunta que importa não é "deu erro?", é "o
 * dinheiro pode ter saído?". 4xx é recusa processada (exceto timeout, conflito de idempotência e
 * rate limit, que não garantem nada). 5xx, rede e 2xx sem id são incertos: liberar a linha e deixar
 * nascer outra, com chave nova, é exatamente o caminho do repasse em dobro.
 */
export function classifyTransferResponse(input: {
  httpStatus: number | null;
  transferId: string | null;
  rawStatus: string | null;
}): TransferOutcome {
  const http = input.httpStatus ?? 0;
  if (http >= 200 && http < 300) {
    return input.transferId
      ? { kind: "sent", rowStatus: transferRowStatus(input.rawStatus) }
      : { kind: "uncertain" };
  }
  if (http >= 400 && http < 500 && ![408, 409, 429].includes(http)) return { kind: "rejected" };
  return { kind: "uncertain" };
}

/**
 * A linha nunca encostou no gateway? Só nesse caso o pré-voo pode cancelá-la. Uma tentativa anterior
 * que caiu em timeout pode ter movido o dinheiro, e o saldo insuficiente de agora pode ser o reflexo
 * dela; cancelar e abrir chave nova pagaria duas vezes.
 */
export function nuncaFoiAoGateway(row: {
  external_transfer_id: string | null;
  failed_reason: string | null;
  raw: unknown;
}): boolean {
  return row.external_transfer_id == null && row.failed_reason == null && row.raw == null;
}
