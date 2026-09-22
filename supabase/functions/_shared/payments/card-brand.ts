// Vocabulário único da bandeira em `payment_method.brand`: visa | mastercard | amex | elo |
// hipercard | card. Cópia Deno de `src/lib/card-brand.ts` (os dois runtimes não se importam).
// O front gravava `visa` e o webhook `card.updated` da Pagar.me sobrescrevia com `Visa`.

export type CardBrand = "visa" | "mastercard" | "amex" | "elo" | "hipercard" | "card";

export function normalizeBrand(raw: string | null | undefined): CardBrand {
  const v = (raw ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (v === "visa" || v === "visaelectron") return "visa";
  if (v === "mastercard" || v === "master" || v === "maestro") return "mastercard";
  if (v === "amex" || v === "americanexpress") return "amex";
  if (v === "elo") return "elo";
  if (v === "hipercard" || v === "hiper") return "hipercard";
  return "card";
}
