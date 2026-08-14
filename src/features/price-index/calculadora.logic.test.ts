import { describe, expect, it } from "vitest";

import { calcResults, sanitizeDays } from "./calculadora.logic";
import type { PriceDestination, PriceUnit } from "./priceIndex.logic";

function unit(overrides: Partial<PriceUnit>): PriceUnit {
  return {
    company_slug: "parceiro",
    company_name: "Parceiro",
    location_slug: "unidade",
    location_name: "Unidade",
    parking_type_code: "uncovered",
    parking_type_name: "Vaga Descoberta",
    checkout_mode: "hub",
    review_avg: null,
    review_count: 0,
    has_shuttle: false,
    shuttle_minutes: null,
    distance_m: 500,
    min_stay_days: null,
    price_updated_at: null,
    prices: [{ days: 7, total: 210, old_total: 252 }],
    ...overrides,
  };
}

const DEST: PriceDestination = {
  slug: "aeroporto-teste",
  code: "TST",
  name: "Aeroporto Teste",
  short_name: "Teste (TST)",
  type: "airport",
  city: "Testópolis",
  state: "TS",
  units: [
    unit({ company_slug: "caro", company_name: "Caro Park", prices: [{ days: 7, total: 300, old_total: null }] }),
    unit({ company_slug: "barato", company_name: "Barato Park" }),
    unit({
      company_slug: "piso",
      company_name: "Piso Park",
      min_stay_days: 10,
      prices: [{ days: 7, total: null, old_total: null }],
    }),
  ],
};

describe("sanitizeDays", () => {
  it("aceita inteiro entre 1 e 60", () => {
    expect(sanitizeDays("7")).toBe(7);
    expect(sanitizeDays(60)).toBe(60);
  });

  it("recusa o que não é duração de estadia", () => {
    expect(sanitizeDays("0")).toBeNull();
    expect(sanitizeDays("61")).toBeNull();
    expect(sanitizeDays("abc")).toBeNull();
    expect(sanitizeDays("")).toBeNull();
  });
});

describe("calcResults", () => {
  it("ranqueia do menor total para o maior e separa quem exige estadia mínima", () => {
    const r = calcResults(DEST, 7);
    expect(r.priced.map((c) => c.row.unit.company_slug)).toEqual(["barato", "caro"]);
    expect(r.priced[0].cell.total).toBe(210);
    expect(r.priced[0].cell.economyPct).toBe(17);
    expect(r.blocked).toHaveLength(1);
    expect(r.blocked[0].cell.minStayDays).toBe(10);
  });
});
