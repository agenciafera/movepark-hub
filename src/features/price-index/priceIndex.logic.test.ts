import { describe, expect, it } from "vitest";

import {
  airportStates,
  buildAirportSections,
  buildMatrix,
  carUnits,
  destinationSummary,
  durationLabel,
  economyPct,
  formatDistance,
  groupAirports,
  listingPath,
  metaDescription,
  motoUnits,
  overallStats,
  matchesAirportFilter,
  minPerDay,
  periodLabel,
  sortRowsByPeriod,
  topRows,
  unitLabel,
  type AirportMeta,
  type AirportSection,
  type IndexProspect,
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

describe("buildAirportSections", () => {
  const meta = (slug: string, overrides: Partial<AirportMeta> = {}): AirportMeta => ({
    slug,
    code: "TST",
    name: `Aeroporto ${slug}`,
    short_name: null,
    city: "Testópolis",
    state: "TS",
    ...overrides,
  });
  const prospect = (slug: string): IndexProspect => ({
    name: `Lote ${slug}`,
    slug,
    distance_km: 1.2,
  });

  it("todo aeroporto publicado vira seção, com ou sem parceiro precificado", () => {
    const index = { days: DIAS, destinations: [dest([unit({})])] };
    const sections = buildAirportSections(
      [meta("aeroporto-teste"), meta("aeroporto-vazio")],
      index,
      {},
    );
    expect(sections).toHaveLength(2);
    expect(sections[0].dest).not.toBeNull();
    expect(sections[1].dest).toBeNull();
    expect(sections[1].rows).toHaveLength(0);
  });

  it("parceiro tem prioridade e o lote mapeado completa até o limite", () => {
    const index = { days: DIAS, destinations: [dest([unit({}), unit({ company_slug: "b", company_name: "B" })])] };
    const sections = buildAirportSections(
      [meta("aeroporto-teste")],
      index,
      { "aeroporto-teste": [prospect("l1"), prospect("l2"), prospect("l3"), prospect("l4")] },
      5,
    );
    expect(sections[0].rows).toHaveLength(2);
    expect(sections[0].mapeados).toHaveLength(3);
    expect(sections[0].hiddenProspectCount).toBe(1);
  });

  it("com o corte cheio de parceiros, os mapeados ficam todos de fora", () => {
    const units = ["a", "b", "c", "d", "e", "f"].map((s) =>
      unit({ company_slug: s, company_name: s, location_slug: s }),
    );
    const sections = buildAirportSections(
      [meta("aeroporto-teste")],
      { days: DIAS, destinations: [dest(units)] },
      { "aeroporto-teste": [prospect("l1"), prospect("l2")] },
      5,
    );
    expect(sections[0].rows).toHaveLength(5);
    expect(sections[0].hiddenPartnerCount).toBe(1);
    expect(sections[0].mapeados).toHaveLength(0);
    expect(sections[0].hiddenProspectCount).toBe(2);
  });
});

describe("matchesAirportFilter", () => {
  const section = (over: Partial<AirportMeta>, comParceiro = false): AirportSection => {
    const index = {
      days: DIAS,
      destinations: comParceiro ? [dest([unit({})])] : [],
    };
    const m: AirportMeta = {
      slug: "aeroporto-teste",
      code: "TST",
      name: "Aeroporto Teste",
      short_name: "Teste (TST)",
      city: "Testópolis",
      state: "TS",
      ...over,
    };
    return buildAirportSections([m], index, {})[0];
  };

  it("busca ignora acento e maiúscula, e acha por cidade e código", () => {
    const s = section({ city: "São Paulo", code: "GRU" });
    expect(matchesAirportFilter(s, { busca: "sao paulo", uf: null, soComReserva: false })).toBe(true);
    expect(matchesAirportFilter(s, { busca: "gru", uf: null, soComReserva: false })).toBe(true);
    expect(matchesAirportFilter(s, { busca: "confins", uf: null, soComReserva: false })).toBe(false);
  });

  it("UF corta o resto e reserva online exige linha de parceiro", () => {
    const semParceiro = section({ state: "SP" });
    expect(matchesAirportFilter(semParceiro, { busca: "", uf: "SP", soComReserva: false })).toBe(true);
    expect(matchesAirportFilter(semParceiro, { busca: "", uf: "MG", soComReserva: false })).toBe(false);
    expect(matchesAirportFilter(semParceiro, { busca: "", uf: null, soComReserva: true })).toBe(false);
    const comParceiro = section({ slug: "aeroporto-teste" }, true);
    expect(matchesAirportFilter(comParceiro, { busca: "", uf: null, soComReserva: true })).toBe(true);
  });
});

describe("airportStates", () => {
  it("lista as UFs presentes, sem repetição e sem nulo", () => {
    const m = (slug: string, state: string | null): AirportMeta => ({
      slug,
      code: null,
      name: slug,
      short_name: null,
      city: null,
      state,
    });
    expect(airportStates([m("a", "SP"), m("b", "MG"), m("c", "SP"), m("d", null)])).toEqual([
      "MG",
      "SP",
    ]);
  });
});

describe("sortRowsByPeriod", () => {
  /**
   * A ordem do índice responde ao seletor de período. Sem isso o topo da lista
   * anunciava "menor preço" com o número de outra duração ao lado.
   */
  it("ordena pelo preço do período escolhido, e não pela diária avulsa", () => {
    // `barato7` custa mais na diária avulsa e menos em 7 diárias que `barato1`.
    const barato1 = unit({
      company_slug: "a",
      company_name: "A",
      prices: [
        { days: 1, total: 10, old_total: null },
        { days: 7, total: 210, old_total: null },
        { days: 15, total: 300, old_total: null },
      ],
    });
    const barato7 = unit({
      company_slug: "b",
      company_name: "B",
      prices: [
        { days: 1, total: 50, old_total: null },
        { days: 7, total: 70, old_total: null },
        { days: 15, total: 450, old_total: null },
      ],
    });
    const { rows } = buildMatrix(dest([barato1, barato7]), [1, 7, 15], 1);

    expect(sortRowsByPeriod(rows, 1).map((r) => r.label)).toEqual(["A", "B"]);
    expect(sortRowsByPeriod(rows, 7).map((r) => r.label)).toEqual(["B", "A"]);
    expect(sortRowsByPeriod(rows, 15).map((r) => r.label)).toEqual(["A", "B"]);
  });

  it("linha sem preço no período cai para o fim", () => {
    const comPreco = unit({ company_slug: "a", company_name: "A" });
    const semDiaria = unit({
      company_slug: "b",
      company_name: "B",
      min_stay_days: 3,
      prices: [
        { days: 7, total: 7, old_total: null },
        { days: 15, total: 15, old_total: null },
      ],
    });
    const { rows } = buildMatrix(dest([comPreco, semDiaria]), [1, 7, 15], 1);

    expect(sortRowsByPeriod(rows, 1).map((r) => r.label)).toEqual(["A", "B"]);
    // Em 7 diárias B é mais barato e passa na frente.
    expect(sortRowsByPeriod(rows, 7).map((r) => r.label)).toEqual(["B", "A"]);
  });

  it("não muda a lista original nem quais linhas aparecem", () => {
    const { rows } = buildMatrix(dest([unit({}), unit({ company_slug: "b", company_name: "B" })]), [1, 7, 15], 1);
    const antes = rows.map((r) => r.label);
    const ordenado = sortRowsByPeriod(rows, 15);
    expect(rows.map((r) => r.label)).toEqual(antes);
    expect(ordenado).toHaveLength(rows.length);
  });
});

describe("periodLabel", () => {
  it("nomeia os três períodos do seletor", () => {
    expect(periodLabel(1)).toBe("diária avulsa");
    expect(periodLabel(7)).toBe("7 diárias");
    expect(periodLabel(15)).toBe("15 diárias");
  });
});

describe("groupAirports", () => {
  const secao = (over: Partial<AirportSection>): AirportSection => ({
    meta: {
      slug: "s",
      code: null,
      name: "Aeroporto",
      short_name: null,
      city: null,
      state: "SP",
    },
    dest: null,
    rows: [],
    mapeados: [],
    hiddenPartnerCount: 0,
    hiddenProspectCount: 0,
    ...over,
  });

  it("separa por aquilo que a Movepark consegue prometer em cada aeroporto", () => {
    const { rows } = buildMatrix(dest([unit({})]), [1, 7, 15], 1);
    const comParceiro = secao({ rows });
    const soMapeado = secao({ mapeados: [{ name: "Lote", slug: "lote", distance_km: 1 }] });
    const vazio = secao({});

    const g = groupAirports([vazio, comParceiro, soMapeado]);

    expect(g.comReserva).toEqual([comParceiro]);
    expect(g.mapeados).toEqual([soMapeado]);
    expect(g.aindaMapeando).toEqual([vazio]);
  });

  /** Ficha que ficou fora do corte ainda é ficha: o aeroporto não está vazio. */
  it("aeroporto cujo lote mapeado ficou fora do corte não conta como vazio", () => {
    const g = groupAirports([secao({ hiddenProspectCount: 2 })]);
    expect(g.mapeados).toHaveLength(1);
    expect(g.aindaMapeando).toHaveLength(0);
  });

  it("um aeroporto entra em exatamente um grupo", () => {
    const { rows } = buildMatrix(dest([unit({})]), [1, 7, 15], 1);
    const todas = [secao({ rows }), secao({ mapeados: [{ name: "L", slug: "l", distance_km: null }] }), secao({})];
    const g = groupAirports(todas);
    expect(g.comReserva.length + g.mapeados.length + g.aindaMapeando.length).toBe(todas.length);
  });
});

describe("minPerDay", () => {
  it("acompanha a duração pedida, e não só a diária avulsa", () => {
    const caro1 = unit({
      company_slug: "a",
      prices: [
        { days: 1, total: 30, old_total: null },
        { days: 7, total: 70, old_total: null },
      ],
    });
    const barato1 = unit({
      company_slug: "b",
      prices: [
        { days: 1, total: 20, old_total: null },
        { days: 7, total: 140, old_total: null },
      ],
    });
    const index = { days: DIAS, destinations: [dest([caro1, barato1])] };

    expect(minPerDay(index, 1)).toBe(20);
    expect(minPerDay(index, 7)).toBe(10);
  });

  it("sem preço na duração devolve null, em vez de zero", () => {
    const index = { days: DIAS, destinations: [dest([unit({ prices: [] })])] };
    expect(minPerDay(index, 7)).toBeNull();
  });
});
