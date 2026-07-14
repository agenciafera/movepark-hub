import { describe, expect, it } from "vitest";
import {
  strategyChangeDropsTiers,
  whyCannotSave,
  type DraftRule,
  type TierLike,
} from "./pricing-draft.logic";

const emptyRule: DraftRule = {
  incremental_one_day_price: null,
  incremental_two_days_price: null,
  incremental_base: null,
  incremental_multiplier: null,
  monthly_fixed_price: null,
  monthly_daily_rate: null,
  hourly_daily_rate: null,
  surcharge_source_id: null,
  surcharge_multiplier: null,
};

function tier(over: Partial<TierLike> = {}): TierLike {
  return { from_day: 1, to_day: null, unit_price: 29.9, total_price: null, ...over };
}

describe("whyCannotSave", () => {
  it("bloqueia estratégia de faixas sem nenhuma faixa", () => {
    expect(whyCannotSave("fixed_bracket", [], emptyRule)).toBe(
      "Adicione pelo menos uma faixa de preço.",
    );
  });

  it("bloqueia faixa sem preço", () => {
    const tiers = [tier(), tier({ from_day: 2, unit_price: null })];
    expect(whyCannotSave("uniform_by_duration", tiers, emptyRule)).toBe(
      "Toda faixa precisa de um preço maior que zero.",
    );
  });

  it("bloqueia faixa com preço zero", () => {
    expect(whyCannotSave("fixed_bracket", [tier({ unit_price: 0 })], emptyRule)).not.toBeNull();
  });

  it("aceita faixa com preço total em vez de preço por dia", () => {
    const tiers = [tier({ to_day: 1, unit_price: null, total_price: 40 })];
    expect(whyCannotSave("fixed_bracket", tiers, emptyRule)).toBeNull();
  });

  it("aceita a tabela do Virapark", () => {
    const tiers = [
      tier({ from_day: 1, to_day: 1, unit_price: null, total_price: 40 }),
      tier({ from_day: 2, to_day: 6, unit_price: 29.9 }),
      tier({ from_day: 7, to_day: 14, unit_price: 17.9 }),
      tier({ from_day: 15, to_day: null, unit_price: 19.9 }),
    ];
    expect(whyCannotSave("fixed_bracket", tiers, emptyRule)).toBeNull();
  });

  it("bloqueia hourly_capped sem teto de diária", () => {
    expect(whyCannotSave("hourly_capped", [], emptyRule)).toBe("Informe o teto da diária.");
    expect(
      whyCannotSave("hourly_capped", [], { ...emptyRule, hourly_daily_rate: 50 }),
    ).toBeNull();
  });

  it("bloqueia monthly_remainder sem pacote mensal", () => {
    expect(whyCannotSave("monthly_remainder", [], emptyRule)).not.toBeNull();
    expect(
      whyCannotSave("monthly_remainder", [], { ...emptyRule, monthly_fixed_price: 600 }),
    ).toBeNull();
  });

  it("bloqueia surcharge sem origem ou sem multiplicador", () => {
    expect(
      whyCannotSave("surcharge", [], { ...emptyRule, surcharge_multiplier: 1.2 }),
    ).not.toBeNull();
    expect(
      whyCannotSave("surcharge", [], { ...emptyRule, surcharge_source_id: "uuid", surcharge_multiplier: 1.2 }),
    ).toBeNull();
  });

  it("bloqueia incremental_formula sem base e multiplicador", () => {
    expect(whyCannotSave("incremental_formula", [], emptyRule)).not.toBeNull();
    expect(
      whyCannotSave("incremental_formula", [], {
        ...emptyRule,
        incremental_base: 10,
        incremental_multiplier: 25,
      }),
    ).toBeNull();
  });
});

describe("strategyChangeDropsTiers", () => {
  it("avisa ao sair de uma estratégia de faixas com faixas preenchidas", () => {
    expect(strategyChangeDropsTiers("hourly_capped", [tier()])).toBe(true);
  });

  it("não avisa quando não há faixa nenhuma", () => {
    expect(strategyChangeDropsTiers("hourly_capped", [])).toBe(false);
  });

  it("não avisa ao trocar entre estratégias que usam faixas", () => {
    expect(strategyChangeDropsTiers("uniform_by_duration", [tier()])).toBe(false);
    expect(strategyChangeDropsTiers("tiered_progressive", [tier()])).toBe(false);
  });
});
