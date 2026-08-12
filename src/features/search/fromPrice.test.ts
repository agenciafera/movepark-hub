import { describe, expect, it } from "vitest";
import { calcFromPrice, type PricingRuleRaw } from "./fromPrice";

function rule(over: Partial<PricingRuleRaw> = {}): PricingRuleRaw {
  return {
    strategy: "uniform_by_duration",
    incremental_one_day_price: null,
    old_price_strategy: "none",
    old_price_multiplier: null,
    hourly_daily_rate: null,
    pricing_tier: [],
    ...over,
  };
}

const tier = (from_day: number, unit_price: number, to_day: number | null = null, old = false) => ({
  from_day,
  to_day,
  total_price: null,
  unit_price,
  is_old_price: old,
});

describe("calcFromPrice", () => {
  it("tabela que cobre 1 diária: preço de 1 diária, como sempre foi", () => {
    const r = calcFromPrice(rule({ pricing_tier: [tier(1, 31.9, 2), tier(3, 26.9)] }));
    expect(r).toEqual({ price: 31.9, oldPrice: null, days: 1 });
  });

  it("tabela que começa em 3 diárias: preço da menor estadia vendável", () => {
    // Abbapark em CWB: R$ 23,90 a diária a partir de 3. Antes o card sumia da home.
    const r = calcFromPrice(rule({ pricing_tier: [tier(3, 23.9, 6), tier(7, 21.9, 14)] }));
    expect(r).toEqual({ price: 71.7, oldPrice: null, days: 3 });
  });

  it("fixed_bracket usa o total da faixa quando ele existe", () => {
    const r = calcFromPrice(
      rule({
        strategy: "fixed_bracket",
        pricing_tier: [{ from_day: 4, to_day: 6, total_price: 150, unit_price: null, is_old_price: false }],
      }),
    );
    expect(r).toEqual({ price: 150, oldPrice: null, days: 4 });
  });

  it("estratégias sem tabela seguem pelo campo da própria regra", () => {
    expect(calcFromPrice(rule({ strategy: "incremental_formula", incremental_one_day_price: 29.9 }))).toEqual({
      price: 29.9,
      oldPrice: null,
      days: 1,
    });
    expect(calcFromPrice(rule({ strategy: "hourly_capped", hourly_daily_rate: 40 }))).toEqual({
      price: 40,
      oldPrice: null,
      days: 1,
    });
  });

  it("preço antigo por multiplicador acompanha a estadia usada", () => {
    const r = calcFromPrice(
      rule({
        pricing_tier: [tier(3, 23.9)],
        old_price_strategy: "multiplier",
        old_price_multiplier: 1.2,
      }),
    );
    expect(r?.price).toBe(71.7);
    expect(r?.oldPrice).toBeCloseTo(86.04, 2);
  });

  it("preço antigo por tabela própria lê a faixa da mesma duração", () => {
    const r = calcFromPrice(
      rule({
        pricing_tier: [tier(3, 23.9), tier(3, 29.9, null, true)],
        old_price_strategy: "own_table",
      }),
    );
    expect(r).toEqual({ price: 71.7, oldPrice: 89.7, days: 3 });
  });

  it("'de' menor ou igual ao 'por' não vira desconto riscado", () => {
    const r = calcFromPrice(
      rule({
        pricing_tier: [tier(1, 30), tier(1, 30, null, true)],
        old_price_strategy: "own_table",
      }),
    );
    expect(r?.oldPrice).toBeNull();
  });

  it("faixa de preço antigo não define a menor estadia vendável", () => {
    const r = calcFromPrice(rule({ pricing_tier: [tier(5, 20), tier(2, 25, null, true)] }));
    expect(r?.days).toBe(5);
  });

  it("sem regra, sem tabela ou com estratégia que depende do motor, não inventa preço", () => {
    expect(calcFromPrice(null)).toBeNull();
    expect(calcFromPrice(rule())).toBeNull();
    expect(calcFromPrice(rule({ strategy: "tiered_progressive", pricing_tier: [tier(3, 20)] }))).toBeNull();
    expect(calcFromPrice(rule({ strategy: "incremental_formula" }))).toBeNull();
  });
});
