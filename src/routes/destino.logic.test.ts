import { describe, expect, it } from "vitest";
import {
  destinationFromPrice,
  lowestPerDay,
  pickRelatedDestinations,
  pointsSummary,
} from "./destino.logic";
import type { PriceDestination, PriceUnit } from "@/features/price-index/priceIndex.logic";

describe("lowestPerDay", () => {
  it("retorna o menor per_day", () => {
    expect(
      lowestPerDay([
        { price: { per_day: 40 } },
        { price: { per_day: 25 } },
        { price: { per_day: 33 } },
      ]),
    ).toBe(25);
  });
  it("null quando vazio", () => {
    expect(lowestPerDay([])).toBeNull();
  });
});

describe("pickRelatedDestinations", () => {
  const all = [
    { id: "a", is_popular: false, sort_order: 1 },
    { id: "b", is_popular: true, sort_order: 5 },
    { id: "c", is_popular: true, sort_order: 2 },
    { id: "cur", is_popular: true, sort_order: 0 },
    { id: "d", is_popular: false, sort_order: 3 },
  ];

  it("exclui o atual, prioriza populares e depois sort_order", () => {
    const r = pickRelatedDestinations(all, "cur").map((d) => d.id);
    expect(r).toEqual(["c", "b", "a", "d"]); // populares (c<b por sort) antes dos não-populares (a<d)
  });

  it("respeita o limite", () => {
    expect(pickRelatedDestinations(all, "cur", 2).map((d) => d.id)).toEqual(["c", "b"]);
  });
});

function unit(over: Partial<PriceUnit> = {}): PriceUnit {
  return {
    company_slug: "abbapark",
    company_name: "Abbapark",
    location_slug: "afonso-pena",
    location_name: "Afonso Pena",
    parking_type_code: "covered",
    parking_type_name: "Vaga coberta",
    checkout_mode: "hub",
    review_avg: null,
    review_count: 0,
    has_shuttle: true,
    shuttle_minutes: null,
    distance_m: 400,
    min_stay_days: null,
    price_updated_at: null,
    prices: [{ days: 1, total: 39.9, old_total: null }],
    ...over,
  };
}

function dest(units: PriceUnit[]): PriceDestination {
  return {
    slug: "aeroporto-afonso-pena",
    code: "CWB",
    name: "Aeroporto Afonso Pena",
    short_name: "Curitiba",
    type: "airport",
    city: "São José dos Pinhais",
    state: "PR",
    units,
  };
}

describe("destinationFromPrice", () => {
  it("pega a menor diária avulsa entre as vagas de carro", () => {
    expect(
      destinationFromPrice(
        dest([
          unit({ prices: [{ days: 1, total: 39.9, old_total: null }] }),
          unit({
            parking_type_code: "uncovered",
            prices: [{ days: 1, total: 24.9, old_total: null }],
          }),
        ]),
      ),
    ).toBe(24.9);
  });

  it("ignora a moto, que compara com moto", () => {
    expect(
      destinationFromPrice(
        dest([
          unit({ prices: [{ days: 1, total: 39.9, old_total: null }] }),
          unit({
            parking_type_code: "motorcycle",
            prices: [{ days: 1, total: 9.9, old_total: null }],
          }),
        ]),
      ),
    ).toBe(39.9);
  });

  it("null quando nenhuma vaga cota uma diária avulsa", () => {
    expect(destinationFromPrice(dest([unit({ prices: [] })]))).toBeNull();
  });
});

describe("pointsSummary", () => {
  it("tira o prefixo repetido quando todos os pontos começam igual", () => {
    expect(pointsSummary(["Terminal 1", "Terminal 2", "Terminal 3"])).toBe("Terminal 1, 2 e 3");
  });

  it("mantém os nomes inteiros quando não há prefixo comum", () => {
    expect(pointsSummary(["Terminal Rodoviário", "Píer Sul"])).toBe(
      "Terminal Rodoviário e Píer Sul",
    );
  });

  it("ponto único sai como está, e lista vazia vira string vazia", () => {
    expect(pointsSummary(["Terminal Único"])).toBe("Terminal Único");
    expect(pointsSummary([])).toBe("");
  });
});
