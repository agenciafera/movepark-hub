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
