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
 * Teto do saque (E0.3.8, fechado em 17/09/2026): o parceiro pede um valor A até o NOSSO disponível
 * inteiro. A taxa de saque sai DE DENTRO desse valor: o gateway recebe o pedido de A − taxa, cobra
 * a taxa do saldo, e o recebedor sai exatamente A. Na conta bancária cai A − taxa, e a tela avisa
 * isso antes de confirmar. O teto físico é o saldo real do gateway. hub_admin passa do teto nosso
 * só com `force`.
 */
export function withdrawCap(
  args: {
    amountCents: number;
    availableCents: number;
    feeCents: number;
    gatewayAvailableCents: number | null;
    isHubAdmin: boolean;
    force: boolean;
  },
): { ok: true; toBankCents: number } | { ok: false; reason: string; status: number } {
  const fee = Math.max(0, args.feeCents);
  if (args.amountCents <= fee) {
    return { ok: false, reason: `O saque precisa ser maior que a taxa de ${fee} centavos.`, status: 400 };
  }
  if (args.gatewayAvailableCents != null && args.amountCents > args.gatewayAvailableCents) {
    return {
      ok: false,
      reason: `O saldo no gateway (${args.gatewayAvailableCents} centavos) não cobre o saque de ${args.amountCents}.`,
      status: 409,
    };
  }
  if (args.amountCents > args.availableCents && !(args.isHubAdmin && args.force)) {
    return {
      ok: false,
      reason: `Disponível para saque é ${args.availableCents} centavos; o pedido foi de ${args.amountCents}.`,
      status: 409,
    };
  }
  return { ok: true, toBankCents: args.amountCents - fee };
}
