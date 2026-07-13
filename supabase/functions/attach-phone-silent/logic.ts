// Lógica pura da Edge attach-phone-silent. Normalização de telefone pra E.164 — testável sem rede.

/** Telefone → E.164 (`+` + dígitos). null se claramente inválido (fora de 8..15 dígitos). */
export function normalizePhone(raw: unknown): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return null;
  const digits = v.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}
