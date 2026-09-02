import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PriceDestination, PriceUnit } from "@/features/price-index/priceIndex.logic";
import { destinationSummary } from "@/features/price-index/priceIndex.logic";
import {
  DESTINO_DURATIONS,
  PRECO_PESQUISADO_TTL_DIAS,
  buildDestinoPrices,
  destinationMetaDescription,
  isPesquisaFresca,
  longStayInsight,
  pesquisadoRows,
  pesquisadoSummary,
  proximityRanking,
} from "./destinoPrices.logic";
import type { PesquisadoInput } from "./destinoPrices.logic";

const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

function unit(over: Partial<PriceUnit> = {}): PriceUnit {
  return {
    company_slug: "virapark",
    company_name: "Virapark",
    location_slug: "virapark",
    location_name: "Virapark",
    public_path: "/estacionamentos/aeroporto-viracopos/virapark",
    parking_type_code: "covered",
    parking_type_name: "Vaga Coberta",
    checkout_mode: "external",
    review_avg: null,
    review_count: 0,
    has_shuttle: false,
    shuttle_minutes: null,
    distance_m: 1289,
    min_stay_days: null,
    price_updated_at: "2026-08-16T22:00:38.941Z",
    prices: [
      { days: 1, total: 40, old_total: 40 },
      { days: 7, total: 174.3, old_total: 280 },
      { days: 15, total: 373.5, old_total: 600 },
      { days: 30, total: 747, old_total: 1200 },
    ],
    ...over,
  };
}

// Os números são os de Viracopos no motor em 16/08/2026, para o teste falhar
// junto com a página quando a conta mudar.
function viracopos(over: Partial<PriceDestination> = {}): PriceDestination {
  return {
    slug: "aeroporto-de-viracopos",
    public_slug: "aeroporto-de-viracopos",
    code: "VCP",
    name: "Aeroporto de Viracopos",
    short_name: "Viracopos (VCP)",
    type: "airport",
    city: "Campinas",
    state: "SP",
    units: [
      unit(),
      unit({
        company_slug: "garageinn",
        company_name: "Garageinn",
        location_slug: "aeroporto-viracopos",
        location_name: "Aeroporto de Viracopos",
        parking_type_code: "uncovered",
        parking_type_name: "Vaga Descoberta",
        distance_m: 328,
        prices: [
          { days: 1, total: 59.99, old_total: 59.99 },
          { days: 7, total: 321.3, old_total: 419.93 },
          { days: 15, total: 688.5, old_total: 899.85 },
          { days: 30, total: 1377, old_total: 1799.7 },
        ],
      }),
    ],
    ...over,
  };
}

describe("longStayInsight", () => {
  it("mede a queda do preço por diária na vaga que mais cai", () => {
    const insight = longStayInsight(viracopos(), DESTINO_DURATIONS);
    // Virapark: R$ 40,00 na avulsa contra R$ 24,90 em 30 diárias (747/30).
    expect(insight).toMatchObject({
      unitLabel: "Virapark",
      fromDays: 1,
      toDays: 30,
      perDayFrom: 40,
      dropPct: 38,
    });
    expect(insight?.perDayTo).toBeCloseTo(24.9, 2);
  });

  it("cala quando nenhuma vaga dá desconto por permanência", () => {
    const fixa = viracopos({
      units: [
        unit({
          prices: [
            { days: 1, total: 40, old_total: 40 },
            { days: 7, total: 280, old_total: 280 },
            { days: 30, total: 1200, old_total: 1200 },
          ],
        }),
      ],
    });
    expect(longStayInsight(fixa, DESTINO_DURATIONS)).toBeNull();
  });

  it("compara com a maior duração que a vaga realmente cota", () => {
    const semTrinta = viracopos({
      units: [
        unit({
          prices: [
            { days: 1, total: 40, old_total: 40 },
            { days: 7, total: 174.3, old_total: 280 },
          ],
        }),
      ],
    });
    expect(longStayInsight(semTrinta, DESTINO_DURATIONS)?.toDays).toBe(7);
  });
});

describe("buildDestinoPrices", () => {
  it("entrega a mesma tabela e o mesmo resumo do índice de preços", () => {
    const dest = viracopos();
    const bloco = buildDestinoPrices(dest);
    // A garantia que importa: /destinos/<slug> e /precos/<slug> não podem divergir.
    expect(bloco.summary).toEqual(destinationSummary(dest, DESTINO_DURATIONS));
    expect(bloco.matrix.rows.map((r) => r.label)).toEqual(["Virapark", "Garageinn"]);
    expect(bloco.matrix.rows[0].cells[0]).toMatchObject({ days: 1, total: 40, isCheapest: true });
    expect(bloco.lastUpdated).toBe("2026-08-16T22:00:38.941Z");
  });
});

describe("destinationMetaDescription", () => {
  const base = {
    label: "Aeroporto Viracopos",
    city: "Campinas",
    fallback: "Reserve estacionamento perto do Aeroporto Viracopos.",
  };
  const comPreco = destinationSummary(viracopos(), DESTINO_DURATIONS);

  // Os textos reais do banco em 17/08/2026. São os que mandam na SERP hoje, e nenhum
  // deles traz um único número.
  const VCP =
    "Estacionamento perto do Aeroporto de Viracopos (VCP), em Campinas, com traslado ao terminal. Compare preços e reserve a sua vaga pela Movepark.";
  const GRU =
    "Procurando estacionamento perto do Aeroporto de Guarulhos (GRU)? Veja opções com traslado para os Terminais 1, 2 e 3 e reserve a sua vaga pela Movepark.";

  it("abre espaço para o preço descartando o fecho genérico, e mantém a geografia", () => {
    const texto = destinationMetaDescription({ ...base, authored: VCP, summary: comPreco });
    // Sobrou a frase que localiza (Campinas, traslado ao terminal) e entrou o número.
    expect(texto).toContain("em Campinas, com traslado ao terminal.");
    // O Intl separa símbolo e valor com espaço NÃO quebrável; comparar com espaço
    // comum daria um falso negativo e esconderia a asserção que interessa.
    expect(texto).toContain(brl(40));
    expect(texto).toContain(brl(174.3));
    // O fecho genérico foi o que saiu, e saiu inteiro (nunca no meio da frase).
    expect(texto).not.toContain("reserve a sua vaga pela Movepark");
    expect(texto.length).toBeLessThanOrEqual(160);
  });

  it("prefere a geografia ao número quando o que sobraria vira um toco", () => {
    // Guarulhos: descartar o fecho deixaria só "Procurando estacionamento perto do
    // Aeroporto de Guarulhos (GRU)?", e os Terminais 1, 2 e 3 valem mais que o preço.
    expect(destinationMetaDescription({ ...base, authored: GRU, summary: comPreco })).toBe(GRU);
  });

  it("não mexe em texto que já foi escrito com preço à mão", () => {
    const autoral = "Estacionamento no VCP a partir de R$ 29,90 a diária, com traslado 24h.";
    expect(destinationMetaDescription({ ...base, authored: autoral, summary: comPreco })).toBe(
      autoral,
    );
  });

  it("sem preço, devolve o texto humano intacto", () => {
    expect(destinationMetaDescription({ ...base, authored: VCP, summary: null })).toBe(VCP);
    const vazio = destinationSummary(viracopos({ units: [] }), DESTINO_DURATIONS);
    expect(destinationMetaDescription({ ...base, authored: VCP, summary: vazio })).toBe(VCP);
  });

  it("sem texto humano nem preço, cai no genérico", () => {
    expect(destinationMetaDescription({ ...base, summary: null })).toBe(base.fallback);
  });

  it("sem texto humano, deriva tudo do dado", () => {
    const texto = destinationMetaDescription({ ...base, summary: comPreco, prospectCount: 4 });
    expect(texto).toContain(brl(40));
    expect(texto).toContain("2 estacionamentos parceiros e mais 4 mapeados");
    expect(texto.length).toBeLessThanOrEqual(160);
  });

  it("nunca corta no meio de uma palavra", () => {
    const texto = destinationMetaDescription({
      ...base,
      label: "Aeroporto Internacional de São Paulo, Guarulhos, Governador André Franco Montoro",
      summary: comPreco,
    });
    expect(texto.length).toBeLessThanOrEqual(160);
    expect(texto.endsWith("…")).toBe(true);
    expect(texto).not.toMatch(/[ ,.]…$/);
  });
});

describe("proximityRanking", () => {
  const prospects = [
    { name: "Estacionamento Oficial de Viracopos (Estapar)", slug: "estapar", distance_km: 1.2 },
    { name: "BR Parking", slug: "br-parking", distance_km: 2.8 },
    { name: "Sem medida", slug: "sem-medida", distance_km: null },
  ];

  it("ordena parceiro e lote mapeado juntos, pela distância medida", () => {
    const linhas = proximityRanking({
      units: viracopos().units,
      prospects,
      destinationSlug: "aeroporto-de-viracopos",
      anchorLabel: "do terminal",
    });
    expect(linhas.map((l) => [l.name, l.distanceLabel, l.kind])).toEqual([
      ["Garageinn", "328 m do terminal", "partner"],
      ["Estacionamento Oficial de Viracopos (Estapar)", "1,2 km do terminal", "mapped"],
      ["Virapark", "1,3 km do terminal", "partner"],
      ["BR Parking", "2,8 km do terminal", "mapped"],
      // Sem medida vai para o fim, e sem número: a lista promete ordem por
      // distância, e um "sem medida" no meio quebraria a comparação.
      ["Sem medida", null, "mapped"],
    ]);
  });

  it("o lote sem distância medida entra no fim, e não some da página", () => {
    // Desde que a lista virou a ÚNICA superfície do lote mapeado (redesenho de
    // 19/08/2026), filtrar por distância aqui apagaria o lote inteiro da página.
    const linhas = proximityRanking({
      units: [unit({ distance_m: null })],
      prospects,
      destinationSlug: "aeroporto-de-viracopos",
    });
    expect(linhas.map((l) => l.name)).toEqual([
      "Estacionamento Oficial de Viracopos (Estapar)",
      "BR Parking",
      "Sem medida",
    ]);
  });

  it("o nome do ponto vence o rótulo genérico do destino na distância", () => {
    const linhas = proximityRanking({
      units: [],
      prospects: [
        { name: "Talentos Park", slug: "talentos", distance_km: 0.4, reference_name: "Terminal 2" },
      ],
      destinationSlug: "aeroporto-de-guarulhos",
      anchorLabel: "do terminal",
    });
    expect(linhas[0].distanceLabel).toBe("400 m do Terminal 2");
  });

  it("carrega endereço e nota do lote mapeado, que a lista absorveu do card", () => {
    const linhas = proximityRanking({
      units: [],
      prospects: [
        {
          name: "Talentos Park",
          slug: "talentos",
          address: "R. Projetada, 169",
          distance_km: 1.01,
          rating: { avg: 4.4, count: 137 },
        },
      ],
      destinationSlug: "aeroporto-de-guarulhos",
    });
    expect(linhas[0].address).toBe("R. Projetada, 169");
    expect(linhas[0].rating).toEqual({ avg: 4.4, count: 137 });
  });

  it("o endereço do parceiro vem da vitrine, porque a matriz do motor não carrega endereço", () => {
    const linhas = proximityRanking({
      units: [unit({ distance_m: 328 })],
      prospects: [],
      destinationSlug: "aeroporto-de-viracopos",
      addressByLocation: new Map([["virapark/virapark", "Av. dos Amarais, 100"]]),
    });
    expect(linhas[0].address).toBe("Av. dos Amarais, 100");
  });

  it("não repete o mesmo endereço quando a unidade tem duas vagas", () => {
    const duasVagas = [
      unit({ parking_type_code: "covered", distance_m: 1289 }),
      unit({
        parking_type_code: "uncovered",
        parking_type_name: "Vaga Descoberta",
        distance_m: 1289,
      }),
    ];
    const linhas = proximityRanking({
      units: duasVagas,
      prospects: [],
      destinationSlug: "aeroporto-de-viracopos",
    });
    expect(linhas).toHaveLength(1);
    expect(linhas[0].path).toBe("/estacionamentos/aeroporto-viracopos/virapark");
  });

  it("não fala de traslado na lista de distância, nem quando a unidade declara ter", () => {
    // `location.has_shuttle` está `false` nas duas unidades de Viracopos enquanto os cards
    // da mesma página mostram "Transfer grátis" pelas amenidades. Enquanto o campo não for
    // confiável, esta lista fala só de distância. Só o lote mapeado ganha marca, e a marca
    // é sobre reserva, não sobre traslado (ADR-010).
    const linhas = proximityRanking({
      units: [unit({ has_shuttle: true })],
      prospects: [{ name: "Mapeado", slug: "mapeado", distance_km: 2 }],
      destinationSlug: "d",
    });
    expect(linhas.find((l) => l.kind === "partner")?.detail).toBeNull();
    expect(linhas.find((l) => l.kind === "mapped")?.detail).toBe("sem reserva online");
  });
});

describe("preço pesquisado do lote mapeado", () => {
  // O relógio congela porque a validade do preço de terceiro conta a partir da data da
  // pesquisa: sem isto a suíte passaria hoje e começaria a falhar sozinha em 90 dias.
  const HOJE = new Date("2026-09-02T12:00:00Z");
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(HOJE);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function mapeado(over: Partial<PesquisadoInput> = {}): PesquisadoInput {
    return {
      name: "Central Park",
      public_name: "Central Park - Estacionamento Aeroporto Confins",
      slug: "central-park-aeroporto-confins",
      public_path: "/estacionamentos/aeroporto-confins/central-park",
      researched_daily_brl: 22.9,
      researched_weekly_brl: 168,
      researched_biweekly_brl: null,
      researched_monthly_brl: null,
      researched_at: "2026-08-29",
      ...over,
    };
  }

  it("alinha cada valor com a sua duração e deixa nulo onde a pesquisa não cobriu", () => {
    const [linha] = pesquisadoRows([mapeado()], "aeroporto-confins");
    expect(DESTINO_DURATIONS).toEqual([1, 7, 15, 30]);
    expect(linha.totals).toEqual([22.9, 168, null, null]);
    expect(linha.label).toBe("Central Park - Estacionamento Aeroporto Confins");
    // A coluna leva o nome canônico; a frase de resposta rápida leva só a marca, senão
    // vira "R$ 22,90 no Central Park - Estacionamento Aeroporto Confins, preço pesquisado".
    expect(linha.shortLabel).toBe("Central Park");
    expect(linha.path).toBe("/estacionamentos/aeroporto-confins/central-park");
    expect(linha.researchedAt).toBe("2026-08-29");
  });

  it("descarta preço sem data, que é afirmação sobre o negócio do outro sem lastro", () => {
    // A constraint do banco já garante o par, mas uma leitura antiga em cache não passa por
    // ela. Se escapasse, a página mostraria valor de terceiro sem dizer de quando é.
    expect(pesquisadoRows([mapeado({ researched_at: null })], "d")).toEqual([]);
  });

  it("descarta lote sem nenhum valor, em vez de renderizar linha vazia", () => {
    const semPreco = mapeado({
      researched_daily_brl: null,
      researched_weekly_brl: null,
      researched_biweekly_brl: null,
      researched_monthly_brl: null,
    });
    expect(pesquisadoRows([semPreco], "d")).toEqual([]);
  });

  it("ordena pela semana, que é a compra mais comum e a referência da matriz de parceiro", () => {
    const linhas = pesquisadoRows(
      [
        mapeado({ slug: "caro", public_name: "Caro", researched_weekly_brl: 217 }),
        mapeado({ slug: "barato", public_name: "Barato", researched_weekly_brl: 149 }),
      ],
      "d",
    );
    expect(linhas.map((l) => l.label)).toEqual(["Barato", "Caro"]);
  });

  it("cai na ficha montada quando o lote ainda não tem public_path", () => {
    const [linha] = pesquisadoRows([mapeado({ public_path: null })], "aeroporto-confins");
    expect(linha.path).toBe("/estacionamentos/aeroporto-confins/central-park-aeroporto-confins");
  });

  it("a resposta curta é a menor diária, com a data em que foi conferida", () => {
    const linhas = pesquisadoRows(
      [
        mapeado({ slug: "a", name: "Park Confins", public_name: "Park Confins - X", researched_daily_brl: 35 }),
        mapeado({ slug: "b", name: "Central Park", public_name: "Central Park - X", researched_daily_brl: 22.9 }),
      ],
      "d",
    );
    expect(pesquisadoSummary(linhas)).toEqual({
      total: 22.9,
      label: "Central Park",
      researchedAt: "2026-08-29",
    });
  });

  it("não inventa resposta curta quando nenhum lote publicou diária avulsa", () => {
    const soSemana = mapeado({ researched_daily_brl: null });
    expect(pesquisadoSummary(pesquisadoRows([soSemana], "d"))).toBeNull();
  });

  it("preço vencido sai da página, porque a data ao lado não conserta um número velho", () => {
    // 90 dias contados da pesquisa. A RPC já devolve nulo no vencido; esta é a segunda
    // porta, a que protege o HTML de um build antigo (a página é SSG).
    const vencido = mapeado({ researched_at: "2026-06-04" });
    expect(pesquisadoRows([vencido], "d")).toEqual([]);
  });

  it("o preço do último dia de validade continua na página", () => {
    const noLimite = mapeado({ researched_at: "2026-06-05" });
    expect(pesquisadoRows([noLimite], "d")).toHaveLength(1);
  });

  it("a validade é de 90 dias, o mesmo número que a RPC aplica", () => {
    // Gêmeo em SQL: public.preco_pesquisado_fresco (20261111091500).
    expect(PRECO_PESQUISADO_TTL_DIAS).toBe(90);
    expect(isPesquisaFresca("2026-06-05")).toBe(true);
    expect(isPesquisaFresca("2026-06-04")).toBe(false);
  });
});
