// Bandeira do cartão: uma detecção só para o checkout e a conta, e um vocabulário só para o banco.
//
// Existiam duas detecções divergentes (a da conta dizia que todo cartão começado em 6 era Elo) e
// dois vocabulários: o front gravava `visa` e o webhook `card.updated` da Pagar.me sobrescrevia
// com `Visa`. Tudo que grava `payment_method.brand` passa por `normalizeBrand`, e a Edge tem uma
// cópia em `supabase/functions/_shared/payments/card-brand.ts` (Deno não importa daqui).

export type CardBrand = "visa" | "mastercard" | "amex" | "elo" | "hipercard" | "card";

export const BRAND_LABEL: Record<CardBrand, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  elo: "Elo",
  hipercard: "Hipercard",
  card: "Cartão",
};

/**
 * Detecta a bandeira pelo início do número. Basta para mostrar e salvar; quem valida de fato é o
 * gateway. Elo e Hipercard vêm antes de Visa e Mastercard porque alguns BINs deles começam com 4
 * e 5 (`4011`, `4576`, `5067`, `636`).
 */
export function detectBrand(pan: string): CardBrand {
  const n = pan.replace(/\D/g, "");
  if (n.length < 4) return "card";
  if (/^(606282|3841)/.test(n)) return "hipercard";
  if (/^(401178|401179|438935|451416|457631|457632|504175|506699|5067|509|627780|636297|636368|650|6516|6550)/.test(n)) return "elo";
  if (/^3[47]/.test(n)) return "amex";
  if (/^4/.test(n)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "mastercard";
  return "card";
}

/** O que a Pagar.me manda (`Visa`, `Mastercard`, `American Express`, `Elo`) e o que já gravamos. */
export function normalizeBrand(raw: string | null | undefined): CardBrand {
  const v = (raw ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (v === "visa" || v === "visaelectron") return "visa";
  if (v === "mastercard" || v === "master" || v === "maestro") return "mastercard";
  if (v === "amex" || v === "americanexpress") return "amex";
  if (v === "elo") return "elo";
  if (v === "hipercard" || v === "hiper") return "hipercard";
  return "card";
}

export function brandLabel(raw: string | null | undefined): string {
  return BRAND_LABEL[normalizeBrand(raw)];
}

/**
 * CVV do tamanho certo para a bandeira: 4 dígitos no Amex, 3 nos outros. O "cartão" sem bandeira
 * reconhecida aceita 3 ou 4 e deixa o gateway decidir. Em 10/10/2026 a Pagar.me recusou três vezes
 * um CVV em formato inválido (BePark, R$ 245) e o cliente desistiu sem saber o que estava errado.
 */
export function isCvvValid(cvv: string, brand: CardBrand): boolean {
  if (!/^\d+$/.test(cvv)) return false;
  if (brand === "amex") return cvv.length === 4;
  if (brand === "card") return cvv.length === 3 || cvv.length === 4;
  return cvv.length === 3;
}
