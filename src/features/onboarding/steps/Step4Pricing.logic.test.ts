import { describe, expect, it } from "vitest";
import type { WizardParkingItem } from "../wizardApi";
import { buildPricingTiers, initState, type PriceState } from "./Step4Pricing.logic";

function item(overrides: Partial<WizardParkingItem>): WizardParkingItem {
  return {
    location_parking_type_id: "lpt-1",
    company_parking_type_id: "cpt-1",
    parking_type_id: "pt-1",
    code: "covered",
    name: "Vaga Coberta",
    base_price: 30,
    capacity: 10,
    strategy: null,
    tiers: [],
    ...overrides,
  };
}

describe("initState", () => {
  it("default: fixed_daily usando base_price quando não há tiers", () => {
    const s = initState(item({ strategy: null, tiers: [] }));
    expect(s.mode).toBe("fixed_daily");
    expect(s.daily).toBe(30);
    expect(s.brackets).toEqual([{ from_day: "1", to_day: "", total_price: null }]);
  });

  it("uniform existente: pega o unit_price do tier", () => {
    const s = initState(
      item({ strategy: "uniform_by_duration", base_price: 30, tiers: [{ from_day: 1, to_day: null, unit_price: 27.9, total_price: null }] }),
    );
    expect(s.mode).toBe("fixed_daily");
    expect(s.daily).toBe(27.9);
  });

  it("fixed_bracket existente: reconstrói as faixas (to_day null vira string vazia)", () => {
    const s = initState(
      item({
        strategy: "fixed_bracket",
        tiers: [
          { from_day: 1, to_day: 1, unit_price: null, total_price: 149 },
          { from_day: 2, to_day: null, unit_price: null, total_price: 198 },
        ],
      }),
    );
    expect(s.mode).toBe("fixed_bracket");
    expect(s.brackets).toEqual([
      { from_day: "1", to_day: "1", total_price: 149 },
      { from_day: "2", to_day: "", total_price: 198 },
    ]);
  });
});

describe("buildPricingTiers", () => {
  it("fixed_daily válido → uniform_by_duration com 1 tier aberto", () => {
    const ps: PriceState = { mode: "fixed_daily", daily: 30, brackets: [] };
    const r = buildPricingTiers(ps);
    expect(r).toEqual({
      ok: true,
      strategy: "uniform_by_duration",
      tiers: [{ from_day: 1, to_day: null, unit_price: 30, total_price: null }],
    });
  });

  it("fixed_daily sem preço (0/null) → erro 'daily'", () => {
    expect(buildPricingTiers({ mode: "fixed_daily", daily: 0, brackets: [] })).toEqual({ ok: false, reason: "daily" });
    expect(buildPricingTiers({ mode: "fixed_daily", daily: null, brackets: [] })).toEqual({ ok: false, reason: "daily" });
  });

  it("fixed_bracket válido → faixas com total_price; to_day vazio vira null", () => {
    const ps: PriceState = {
      mode: "fixed_bracket",
      daily: null,
      brackets: [
        { from_day: "1", to_day: "1", total_price: 149 },
        { from_day: "2", to_day: "", total_price: 198 },
      ],
    };
    const r = buildPricingTiers(ps);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.strategy).toBe("fixed_bracket");
      expect(r.tiers).toEqual([
        { from_day: 1, to_day: 1, unit_price: null, total_price: 149 },
        { from_day: 2, to_day: null, unit_price: null, total_price: 198 },
      ]);
    }
  });

  it("fixed_bracket ignora faixas incompletas e falha se nenhuma válida", () => {
    const ps: PriceState = {
      mode: "fixed_bracket",
      daily: null,
      brackets: [
        { from_day: "", to_day: "", total_price: null },
        { from_day: "1", to_day: "", total_price: null },
      ],
    };
    expect(buildPricingTiers(ps)).toEqual({ ok: false, reason: "brackets" });
  });
});
