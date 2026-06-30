// Lógica pura de create-fare-upgrade (testável sem rede): parsing/validação do payload + helpers.

const TIERS = ["basica", "flex", "superflex"] as const;
export type FareTier = (typeof TIERS)[number];

export interface UpgradeInput {
  bookingCode: string;
  targetTier: FareTier;
}

/** Valida { booking_code, target_tier }. */
export function parseUpgradeInput(body: unknown): { input: UpgradeInput | null; error?: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const code = typeof b.booking_code === "string" ? b.booking_code.trim() : "";
  if (!code) return { input: null, error: "booking_code é obrigatório." };
  const target = typeof b.target_tier === "string" ? b.target_tier.trim() : "";
  if (!(TIERS as readonly string[]).includes(target)) {
    return { input: null, error: "target_tier inválido." };
  }
  return { input: { bookingCode: code, targetTier: target as FareTier } };
}

/** Reais (numeric) → centavos (inteiro). */
export function reaisToCents(amount: number): number {
  return Math.round(Number(amount) * 100);
}

/** Telefone BR → { ddd, number } ou null. */
export function parseBrPhone(value: string | null | undefined): { ddd: string; number: string } | null {
  let digits = (value ?? "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  if (digits.length < 10) return null;
  return { ddd: digits.slice(0, 2), number: digits.slice(2, 13) };
}
