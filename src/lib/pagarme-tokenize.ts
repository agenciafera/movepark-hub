// Tokenização de cartão no browser (E0.1.3). O PAN/CVV vão DIRETO para o Pagar.me com a public key
// (publishable) e nunca passam pelo nosso backend. Devolve um token single-use p/ a Edge create-card-charge.

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
 * Falha da tokenização com o que dá para investigar depois: status HTTP (0 = a chamada nem saiu,
 * por rede, bloqueador ou CORS) e o motivo que a Pagar.me devolveu. `diagnostic` nunca carrega
 * dado do cartão: só a mensagem geral e os NOMES dos campos recusados.
 */
export class TokenizeError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly diagnostic: { gateway_message: string | null; fields: string[] },
  ) {
    super(message);
    this.name = "TokenizeError";
  }
}

async function diagnosticFrom(res: Response): Promise<TokenizeError["diagnostic"]> {
  const body = (await res.json().catch(() => null)) as {
    message?: unknown;
    errors?: unknown;
  } | null;
  const errors = body?.errors && typeof body.errors === "object" ? Object.keys(body.errors) : [];
  return {
    gateway_message: typeof body?.message === "string" ? body.message.slice(0, 300) : null,
    fields: errors.slice(0, 10),
  };
}

/**
 * Tokeniza o cartão no Pagar.me. Lança Error com mensagem amigável em falha.
 * `publicKey` vem da Edge get-payment-config (pk_test_/pk_live_).
 */
export async function tokenizeCard(publicKey: string, card: CardData): Promise<TokenizeResult> {
  if (!publicKey) throw new Error("Configuração de pagamento indisponível.");
  const number = card.number.replace(/\D/g, "");
  if (number.length < 13) throw new Error("Número do cartão inválido.");

  let res: Response;
  try {
    res = await fetch(`${PAGARME_TOKENS_URL}?appId=${encodeURIComponent(publicKey)}`, {
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
  } catch (e) {
    throw new TokenizeError("Sem conexão com o pagamento. Confira a internet e tente de novo.", 0, {
      gateway_message: e instanceof Error ? e.message.slice(0, 300) : null,
      fields: [],
    });
  }
  if (!res.ok) {
    throw new TokenizeError(
      "Não foi possível validar o cartão. Confira os dados.",
      res.status,
      await diagnosticFrom(res),
    );
  }
  const body = (await res.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) throw new Error("Falha ao tokenizar o cartão.");

  return { token: body.id, brand: detectBrand(number), last4: number.slice(-4) };
}
