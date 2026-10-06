import { describe, expect, it } from "vitest";
import {
  maisBaratoPorDuracao,
  menorPesquisado,
  mesAnoAtual,
  ondePesquisado,
  respostaMaisBarato,
} from "./maisBarato.logic";
import { DESTINO_DURATIONS, pesquisadoRows } from "@/features/destinations/destinoPrices.logic";
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
    public_slug: "aeroporto-teste",
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

describe("resposta do mercado (Conteúdo 39)", () => {
  // Os números de Confins em 06/10/2026: BePark é o parceiro único; AeroPark e Auto Park
  // Brasil cobram menos e estão no banco com preço pesquisado.
  const opcao = (total: number, days: number, label = "BePark") => ({
    label,
    parkingTypeName: "Vaga Coberta",
    total,
    perDay: total / days,
    path: "/estacionamentos/aeroporto-confins/bepark",
    key: `${label}/coberta`,
  });
  const linhas = [
    { days: 1, vencedor: opcao(45, 1), vice: null },
    { days: 7, vencedor: opcao(200, 7), vice: null },
    { days: 30, vencedor: opcao(400, 30), vice: null },
  ];
  const lote = (
    name: string,
    precos: [number | null, number | null, number | null, number | null],
    researched_at = "2026-09-08",
  ) => ({
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    public_slug: name.toLowerCase().replace(/\s+/g, "-"),
    researched_daily_brl: precos[0],
    researched_weekly_brl: precos[1],
    researched_biweekly_brl: precos[2],
    researched_monthly_brl: precos[3],
    researched_at,
  });
  const agora = new Date("2026-10-06T12:00:00Z");
  const confins = pesquisadoRows(
    [
      lote("AeroPark Confins", [20, 119, 255, 510]),
      lote("Auto Park Brasil", [20, 126, 300, 300]),
      lote("Bandeira Park", [24.99, 125.93, 233.85, 323.7], "2026-10-02"),
    ],
    "aeroporto-confins",
    DESTINO_DURATIONS,
    agora,
  );
  const prosa = "Aeroporto de Confins";
  // O `formatBRL` separa "R$" do número com espaço não separável; o teste compara o texto lido.
  const norm = (t: string) => t.replace(/\u00a0/g, " ");
  const resp = (args: Parameters<typeof respostaMaisBarato>[0]) => {
    const r = respostaMaisBarato(args);
    return { ...r, direta: norm(r.direta), semana: r.semana && norm(r.semana) };
  };

  it("praça de parceiro único: nomeia o menor preço do mercado, com data, e o menor com reserva", () => {
    const r = resp({ prosa, linhas, pesquisados: confins, days: DESTINO_DURATIONS });
    expect(r.direta).toContain(
      "Hoje, a diária avulsa mais barata perto do Aeroporto de Confins é R$ 20,00, no AeroPark Confins e no Auto Park Brasil (preço pesquisado em 08/09/2026, sem reserva online pela Movepark).",
    );
    expect(r.direta).toContain(
      "Com reserva pela Movepark, a menor diária é R$ 45,00, no BePark (Vaga Coberta).",
    );
    // A frase que era falsa para o mercado não volta.
    expect(r.direta).not.toMatch(/mais barata perto do Aeroporto de Confins custa R\$ 45,00/);
    expect(r.direta).toContain(
      "Para 7 dias, o menor total é R$ 119,00 (R$ 17,00 por dia), no AeroPark Confins (preço pesquisado em 08/09/2026); com reserva pela Movepark, R$ 200,00, no BePark.",
    );
    expect(r.direta).toContain(
      "Para 30 dias, o menor total é R$ 300,00 (R$ 10,00 por dia), no Auto Park Brasil",
    );
    expect(r.semana).toMatch(
      /^Estacionar 7 dias perto do Aeroporto de Confins custa a partir de R\$ 119,00/,
    );
    expect(r.menorDoMercado).toEqual({ total: 20, days: 1, pesquisado: true });
  });

  it("quando o parceiro é o mais barato, a frase continua sendo a dele", () => {
    const caro = pesquisadoRows(
      [lote("Park Caro", [60, 300, null, null])],
      "x",
      DESTINO_DURATIONS,
      agora,
    );
    const r = resp({ prosa, linhas, pesquisados: caro, days: DESTINO_DURATIONS });
    expect(r.direta).toMatch(
      /^Hoje, a diária avulsa mais barata perto do Aeroporto de Confins custa R\$ 45,00, no BePark/,
    );
    expect(r.menorDoMercado).toEqual({ total: 45, days: 1, pesquisado: false });
    expect(r.direta).toContain("Os demais são de terceiros");
  });

  it("empate não tira o parceiro da resposta", () => {
    const empate = pesquisadoRows(
      [lote("Park Igual", [45, null, null, null])],
      "x",
      DESTINO_DURATIONS,
      agora,
    );
    const r = resp({ prosa, linhas, pesquisados: empate, days: DESTINO_DURATIONS });
    expect(r.direta).toMatch(/custa R\$ 45,00, no BePark/);
  });

  it("sem preço pesquisado, o texto é o do motor, como antes", () => {
    const r = resp({ prosa, linhas, pesquisados: [], days: DESTINO_DURATIONS });
    expect(r.direta).toContain("Os valores saem do motor de reservas");
    expect(r.direta).not.toContain("pesquisado");
  });

  it("pesquisa vencida (mais de 90 dias) não entra na resposta", () => {
    const velha = pesquisadoRows(
      [lote("Park Velho", [10, 50, null, null], "2026-05-01")],
      "x",
      DESTINO_DURATIONS,
      agora,
    );
    expect(velha).toEqual([]);
  });

  it("datas diferentes no empate saem uma por lote", () => {
    const v = menorPesquisado(
      pesquisadoRows(
        [
          lote("A Park", [20, null, null, null], "2026-09-08"),
          lote("B Park", [20, null, null, null], "2026-10-02"),
        ],
        "x",
        DESTINO_DURATIONS,
        agora,
      ),
      DESTINO_DURATIONS,
      1,
    );
    expect(norm(ondePesquisado(v!))).toBe(
      "no A Park (pesquisado em 08/09/2026) e no B Park (pesquisado em 02/10/2026)",
    );
  });
});
