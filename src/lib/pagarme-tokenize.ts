// Tokenização de cartão no browser (E0.1.3). O PAN/CVV vão DIRETO para o Pagar.me com a public key
// (publishable) — nunca passam pelo nosso backend. Devolve um token single-use p/ a Edge create-card-charge.

import { detectBrand } from "./card-brand";

// A detecção da bandeira mora em `@/lib/card-brand`, a mesma da conta do cliente.
export { detectBrand };

const PAGARME_TOKENS_URL = "https://api.pagar.me/core/v5/tokens";

export interface CardData {
  number: string; // pode vir mascarado; normalizamos aqui
  holder_name: string;
  exp_month: number;
  exp_year: number;
  cvv: string;
}

export interface TokenizeResult {
  token: string;
  brand: string;
  last4: string;
}

/**
 * Tokeniza o cartão no Pagar.me. Lança Error com mensagem amigável em falha.
 * `publicKey` vem da Edge get-payment-config (pk_test_/pk_live_).
 */
export async function tokenizeCard(publicKey: string, card: CardData): Promise<TokenizeResult> {
  if (!publicKey) throw new Error("Configuração de pagamento indisponível.");
  const number = card.number.replace(/\D/g, "");
  if (number.length < 13) throw new Error("Número do cartão inválido.");

  const res = await fetch(`${PAGARME_TOKENS_URL}?appId=${encodeURIComponent(publicKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "card",
      card: {
        number,
        holder_name: card.holder_name,
        exp_month: card.exp_month,
        exp_year: card.exp_year,
        cvv: card.cvv,
      },
    }),
  });
  if (!res.ok) {
    throw new Error("Não foi possível validar o cartão. Confira os dados.");
  }
  const body = (await res.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) throw new Error("Falha ao tokenizar o cartão.");

  return { token: body.id, brand: detectBrand(number), last4: number.slice(-4) };
}
