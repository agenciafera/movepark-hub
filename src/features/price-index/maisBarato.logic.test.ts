import { describe, expect, it } from "vitest";
import { maisBaratoPorDuracao, mesAnoAtual } from "./maisBarato.logic";
import type { PriceDestination, PriceUnit } from "./priceIndex.logic";

function unit(overrides: Partial<PriceUnit> & { company_name: string }): PriceUnit {
  return {
    company_slug: overrides.company_name.toLowerCase().replace(/\s+/g, "-"),
    location_slug: "unidade",
    location_name: "Unidade",
    parking_type_code: "uncovered",
    parking_type_name: "Vaga Descoberta",
    checkout_mode: "movepark",
    review_avg: null,
    review_count: 0,
    has_shuttle: true,
    shuttle_minutes: null,
    distance_m: null,
    min_stay_days: null,
    price_updated_at: null,
    prices: [],
    ...overrides,
  };
}

function dest(units: PriceUnit[]): PriceDestination {
  return {
    slug: "aeroporto-teste",
    code: "TST",
    name: "Aeroporto Teste",
    short_name: "Teste (TST)",
    type: "airport",
    city: "Cidade",
    state: "SP",
    units,
  };
}

describe("maisBaratoPorDuracao", () => {
  it("elege vencedor e vice por duração, pelo menor total", () => {
    const d = dest([
      unit({ company_name: "Caro", prices: [{ days: 1, total: 50, old_total: null }] }),
      unit({ company_name: "Barato", prices: [{ days: 1, total: 30, old_total: null }] }),
      unit({ company_name: "Médio", prices: [{ days: 1, total: 40, old_total: null }] }),
    ]);
    const [linha] = maisBaratoPorDuracao(d, [1]);
    expect(linha.vencedor.label).toBe("Barato");
    expect(linha.vencedor.total).toBe(30);
    expect(linha.vencedor.perDay).toBe(30);
    expect(linha.vice?.label).toBe("Médio");
  });

  it("duração sem preço não gera linha; moto fica fora", () => {
    const d = dest([
      unit({ company_name: "Só Sete", prices: [{ days: 7, total: 140, old_total: null }] }),
      unit({
        company_name: "Moto",
        parking_type_code: "motorcycle",
        prices: [{ days: 1, total: 10, old_total: null }],
      }),
    ]);
    const linhas = maisBaratoPorDuracao(d, [1, 7]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].days).toBe(7);
    expect(linhas[0].vencedor.label).toBe("Só Sete");
    expect(linhas[0].vencedor.perDay).toBe(20);
    expect(linhas[0].vice).toBeNull();
  });
});

describe("mesAnoAtual", () => {
  it("carimba mês por extenso e ano", () => {
    expect(mesAnoAtual(new Date("2026-08-15T12:00:00"))).toBe("agosto/2026");
  });
});
