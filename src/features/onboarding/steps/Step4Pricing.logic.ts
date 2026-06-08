import type { WizardParkingItem } from "../wizardApi";

// Lógica pura da precificação (Step 4) — extraída para teste unitário.

export type Bracket = { from_day: string; to_day: string; total_price: number | null };
export type PriceState = { mode: "fixed_daily" | "fixed_bracket"; daily: number | null; brackets: Bracket[] };
export type PricingTier = {
  from_day: number;
  to_day: number | null;
  unit_price: number | null;
  total_price: number | null;
};
export type BuildResult =
  | { ok: true; strategy: "uniform_by_duration" | "fixed_bracket"; tiers: PricingTier[] }
  | { ok: false; reason: "daily" | "brackets" };

/** Estado inicial da UI a partir do que já está salvo no tipo de vaga. */
export function initState(item: WizardParkingItem): PriceState {
  if (item.strategy === "fixed_bracket" && item.tiers.length) {
    return {
      mode: "fixed_bracket",
      daily: item.base_price,
      brackets: item.tiers.map((t) => ({
        from_day: String(t.from_day),
        to_day: t.to_day != null ? String(t.to_day) : "",
        total_price: t.total_price,
      })),
    };
  }
  const uniform = item.tiers.find((t) => t.unit_price != null);
  return {
    mode: "fixed_daily",
    daily: uniform?.unit_price ?? item.base_price ?? null,
    brackets: [{ from_day: "1", to_day: "", total_price: null }],
  };
}

/** Converte o estado da UI no payload (strategy + tiers) enviado à RPC. */
export function buildPricingTiers(ps: PriceState): BuildResult {
  if (ps.mode === "fixed_daily") {
    if (!ps.daily || ps.daily <= 0) return { ok: false, reason: "daily" };
    return {
      ok: true,
      strategy: "uniform_by_duration",
      tiers: [{ from_day: 1, to_day: null, unit_price: ps.daily, total_price: null }],
    };
  }
  const valid = ps.brackets.filter((b) => b.from_day && b.total_price);
  if (!valid.length) return { ok: false, reason: "brackets" };
  return {
    ok: true,
    strategy: "fixed_bracket",
    tiers: valid.map((b) => ({
      from_day: Number(b.from_day),
      to_day: b.to_day ? Number(b.to_day) : null,
      unit_price: null,
      total_price: b.total_price,
    })),
  };
}
