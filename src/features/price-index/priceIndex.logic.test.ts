import { describe, expect, it } from "vitest";

import {
  buildMatrix,
  carUnits,
  destinationSummary,
  durationLabel,
  economyPct,
  formatDistance,
  listingPath,
  metaDescription,
  motoUnits,
  overallStats,
  topRows,
  unitLabel,
  type PriceDestination,
  type PriceUnit,
} from "./priceIndex.logic";

const DIAS = [1, 7, 15, 30];

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
    prices: DIAS.map((d) => ({ days: d, total: d * 30, old_total: null })),
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
    city: "Testópolis",
    state: "TS",
    units,
  };
}

describe("economyPct", () => {
  it("calcula a economia contra o balcão", () => {
    expect(economyPct({ days: 30, total: 747, old_total: 1200 })).toBe(38);
  });

  it("balcão igual ao preço não vira economia", () => {
    expect(economyPct({ days: 7, total: 174.3, old_total: 174.3 })).toBeNull();
  });

  it("sem balcão não há o que comparar", () => {
    expect(economyPct({ days: 7, total: 100, old_total: null })).toBeNull();
    expect(economyPct(null)).toBeNull();
  });
});

describe("buildMatrix", () => {
  const caro = unit({
    company_slug: "caro",
    company_name: "Caro Park",
    prices: DIAS.map((d) => ({ days: d, total: d * 40, old_total: d * 50 })),
  });
  const barato = unit({
    company_slug: "barato",
    company_name: "Barato Park",
    prices: DIAS.map((d) => ({ days: d, total: d * 20, old_total: null })),
  });
  const comPiso = unit({
    company_slug: "piso",
    company_name: "Piso Park",
    min_stay_days: 3,
    prices: [
      { days: 1, total: null, old_total: null },
      { days: 7, total: 105, old_total: null },
      { days: 15, total: 225, old_total: null },
      { days: 30, total: 450, old_total: null },
    ],
  });

  it("ordena pela duração de referência e marca o mais barato por coluna", () => {
    const m = buildMatrix(dest([caro, comPiso, barato]), DIAS, 7);
    expect(m.rows.map((r) => r.unit.company_slug)).toEqual(["piso", "barato", "caro"]);
    const colunaDiaria = m.rows.map((r) => r.cells.find((c) => c.days === 1)!);
    expect(colunaDiaria.map((c) => c.isCheapest)).toEqual([false, true, false]);
  });

  it("célula abaixo da estadia mínima explica o vazio em vez de inventar preço", () => {
    const m = buildMatrix(dest([comPiso]), DIAS, 7);
    const cell = m.rows[0].cells.find((c) => c.days === 1)!;
    expect(cell.total).toBeNull();
    expect(cell.minStayDays).toBe(3);
    expect(cell.isCheapest).toBe(false);
  });

  it("balcão só entra quando é maior que o preço online", () => {
    const empatado = unit({
      prices: [{ days: 7, total: 174.3, old_total: 174.3 }],
    });
    const m = buildMatrix(dest([empatado]), [7], 7);
    expect(m.rows[0].cells[0].oldTotal).toBeNull();
    expect(m.rows[0].cells[0].economyPct).toBeNull();
  });

  it("moto fica fora da tabela de carro", () => {
    const moto = unit({ parking_type_code: "motorcycle", parking_type_name: "Vaga de Moto" });
    const m = buildMatrix(dest([moto, barato]), DIAS, 7);
    expect(m.rows).toHaveLength(1);
    expect(carUnits([moto, barato])).toHaveLength(1);
    expect(motoUnits([moto, barato])).toHaveLength(1);
  });
});

describe("topRows", () => {
  const fabrica = (slug: string, precos: (number | null)[]) =>
    unit({
      company_slug: slug,
      company_name: slug,
      min_stay_days: precos[0] == null ? 3 : null,
      prices: [1, 7, 15].map((d, i) => ({ days: d, total: precos[i], old_total: null })),
    });

  it("ordena pela diária avulsa e desempata pela duração seguinte", () => {
    const d = dest([
      fabrica("sem-diaria-caro", [null, 200, 400]),
      fabrica("caro", [30, 180, 360]),
      fabrica("barato", [20, 140, 280]),
      fabrica("sem-diaria-barato", [null, 100, 200]),
    ]);
    const { rows } = topRows(d, 5);
    expect(rows.map((r) => r.unit.company_slug)).toEqual([
      "barato",
      "caro",
      "sem-diaria-barato",
      "sem-diaria-caro",
    ]);
  });

  it("corta no limite e conta o que ficou de fora", () => {
    const d = dest([1, 2, 3, 4, 5, 6, 7].map((i) => fabrica(`u${i}`, [i * 10, i * 60, i * 120])));
    const { rows, hiddenCount } = topRows(d, 5);
    expect(rows).toHaveLength(5);
    expect(hiddenCount).toBe(2);
    expect(rows[0].unit.company_slug).toBe("u1");
  });
});

describe("unitLabel", () => {
  it("usa a marca do parceiro", () => {
    const u = unit({ company_name: "Aerovalet" });
    expect(unitLabel(u, [u])).toBe("Aerovalet");
  });

  it("desambigua quando a empresa tem duas unidades no destino", () => {
    const a = unit({ company_slug: "x", company_name: "X Park", location_slug: "a", location_name: "Matriz" });
    const b = unit({ company_slug: "x", company_name: "X Park", location_slug: "b", location_name: "Filial" });
    expect(unitLabel(a, [a, b])).toBe("X Park (Matriz)");
  });
});

describe("destinationSummary", () => {
  it("resume o menor preço por duração com quem o pratica", () => {
    const barato = unit({
      company_slug: "barato",
      company_name: "Barato Park",
      parking_type_name: "Vaga Descoberta",
      prices: DIAS.map((d) => ({ days: d, total: d * 20, old_total: d * 25 })),
    });
    const s = destinationSummary(dest([barato, unit({ company_slug: "outro" })]), DIAS);
    expect(s.unitCount).toBe(2);
    expect(s.byDuration).toHaveLength(4);
    expect(s.byDuration[0]).toMatchObject({ days: 1, from: 20, unitLabel: "Barato Park" });
    expect(s.maxEconomyPct).toBe(20);
  });

  it("duração sem nenhum preço fica fora do resumo", () => {
    const soLongas = unit({
      min_stay_days: 3,
      prices: [
        { days: 1, total: null, old_total: null },
        { days: 7, total: 105, old_total: null },
      ],
    });
    const s = destinationSummary(dest([soLongas]), [1, 7]);
    expect(s.byDuration.map((b) => b.days)).toEqual([7]);
  });
});

describe("overallStats", () => {
  it("agrega destinos, unidades distintas, menor diária e maior economia", () => {
    const d1 = dest([
      unit({ company_slug: "a", location_slug: "l1" }),
      unit({ company_slug: "a", location_slug: "l1", parking_type_code: "covered" }),
    ]);
    const d2 = dest([
      unit({
        company_slug: "b",
        location_slug: "l2",
        prices: [{ days: 1, total: 18.9, old_total: 22.68 }],
      }),
    ]);
    const stats = overallStats({ days: DIAS, destinations: [d1, d2] });
    expect(stats.destinationCount).toBe(2);
    expect(stats.unitCount).toBe(2);
    expect(stats.minDailyFrom).toBe(18.9);
    expect(stats.maxEconomyPct).toBe(17);
  });
});

describe("formatação", () => {
  it("distância em metros até 949 m, depois km com vírgula", () => {
    expect(formatDistance(280)).toBe("280 m");
    expect(formatDistance(949)).toBe("949 m");
    expect(formatDistance(1289)).toBe("1,3 km");
    expect(formatDistance(24120)).toBe("24,1 km");
    expect(formatDistance(2000)).toBe("2 km");
    expect(formatDistance(null)).toBeNull();
  });

  it("rótulo de duração no plural certo", () => {
    expect(durationLabel(1)).toBe("1 diária");
    expect(durationLabel(7)).toBe("7 diárias");
  });

  it("caminho da listagem aponta para /p/", () => {
    expect(listingPath(unit({}))).toBe("/p/parceiro/unidade/uncovered");
  });
});

describe("metaDescription", () => {
  it("responde quanto custa já no snippet e cabe em 160 caracteres", () => {
    const d = dest([unit({})]);
    const s = destinationSummary(d, DIAS);
    const meta = metaDescription(d, s);
    expect(meta).toContain("Teste (TST)");
    expect(meta).toContain("diária a partir de");
    expect(meta.length).toBeLessThanOrEqual(160);
  });
});
