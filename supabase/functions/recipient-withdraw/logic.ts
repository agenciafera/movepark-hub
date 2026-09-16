// Lógica pura do saque (E0.3.7): entrada e pré-voo, sem rede, para caber em teste.

export interface WithdrawInput {
  companyId: string;
  amountCents: number;
  /** hub_admin passando do teto nosso, com confirmação explícita na tela. */
  force: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseWithdrawInput(body: unknown): { input: WithdrawInput | null; error?: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const companyId = typeof b.company_id === "string" ? b.company_id : "";
  const amount = b.amount_cents;
  if (!UUID_RE.test(companyId)) return { input: null, error: "company_id inválido" };
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
    return { input: null, error: "amount_cents precisa ser um inteiro positivo (centavos)" };
  }
  return { input: { companyId, amountCents: amount, force: b.force === true } };
}

/**
 * Pré-voo: só pede o saque quando o saldo DISPONÍVEL lido agora cobre o valor. Leitura ruim não é
 * saldo zero: abortar com motivo claro é melhor do que mandar um saque que o gateway vai recusar
 * e deixar uma linha "falhou" na conta do parceiro.
 */
export function withdrawPreflight(
  balance: { httpStatus: number | null; availableCents: number | null },
  amountCents: number,
): { ok: true } | { ok: false; reason: string; status: number } {
  const http = balance.httpStatus ?? 0;
  if (http < 200 || http >= 300 || balance.availableCents == null) {
    return { ok: false, reason: "Não foi possível ler o saldo do recebedor no gateway. Tente de novo.", status: 502 };
  }
  if (balance.availableCents < amountCents) {
    return {
      ok: false,
      reason: `Saldo disponível (${balance.availableCents} centavos) não cobre o saque (${amountCents}).`,
      status: 409,
    };
  }
  return { ok: true };
}

/**
 * Teto do saque (E0.3.8): o disponível é o NOSSO número (`payout_withdrawable`), não o saldo bruto
 * da Pagar.me. O parceiro nunca passa dele; hub_admin só com `force`, e o que o gateway tem
 * continua sendo o teto físico para todo mundo.
 */
export function withdrawCap(
  args: { amountCents: number; availableCents: number; gatewayAvailableCents: number | null; isHubAdmin: boolean; force: boolean },
): { ok: true } | { ok: false; reason: string; status: number } {
  if (args.amountCents <= args.availableCents) return { ok: true };
  if (args.isHubAdmin && args.force) {
    if (args.gatewayAvailableCents != null && args.amountCents > args.gatewayAvailableCents) {
      return { ok: false, reason: `O gateway só tem ${args.gatewayAvailableCents} centavos disponíveis.`, status: 409 };
    }
    return { ok: true };
  }
  return {
    ok: false,
    reason: `Disponível para saque é ${args.availableCents} centavos; o pedido foi de ${args.amountCents}.`,
    status: 409,
  };
}
