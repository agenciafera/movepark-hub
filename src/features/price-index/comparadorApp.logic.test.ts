import { describe, expect, it } from "vitest";

import {
  breakEvenDays,
  comparar,
  CORRIDA_MINIMA,
  custoCombustivel,
  estimativaCorrida,
  POR_KM_MEDIO,
  porKmDoDestino,
  REFERENCIAS_UBER,
  referenciaApp,
  reservaWindow,
  sanitizeKm,
  UBER_CONSULTADO_EM,
} from "./comparadorApp.logic";
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
    prices: [1, 7, 15, 30].map((d) => ({ days: d, total: d * 20, old_total: null })),
    ...overrides,
  };
}

const DEST: PriceDestination = {
  slug: "aeroporto-teste",
  public_slug: "aeroporto-teste",
  code: "GRU",
  name: "Aeroporto Teste",
  short_name: "Teste (TST)",
  type: "airport",
  city: "Testópolis",
  state: "TS",
  units: [
    unit({}),
    unit({
      company_slug: "caro",
      company_name: "Caro Park",
      prices: [1, 7, 15, 30].map((d) => ({ days: d, total: d * 40, old_total: null })),
    }),
  ],
};

// Preço médio do UberX e distância média publicados pela Uber em
// uber.com/global/pt-br/r/airports/<iata>/, consultados em 23/11/2026.
// Escritos à mão aqui de propósito: se alguém trocar a referência, o teste
// obriga a conferir de novo contra a página.
const PUBLICADO = [
  { codigo: "GRU", preco: 100, km: 30 },
  { codigo: "CGH", preco: 43, km: 11 },
  { codigo: "VCP", preco: 38, km: 17 },
  { codigo: "CNF", preco: 96, km: 41 },
  { codigo: "CWB", preco: 40, km: 19 },
] as const;

describe("referência da Uber por aeroporto", () => {
  it("cobre os cinco aeroportos com parceiro, com data de consulta", () => {
    expect(REFERENCIAS_UBER.map((r) => r.codigo).sort()).toEqual(
      PUBLICADO.map((p) => p.codigo).sort(),
    );
    expect(UBER_CONSULTADO_EM).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const r of REFERENCIAS_UBER) {
      expect(r.fonteUrl).toBe(
        `https://www.uber.com/global/pt-br/r/airports/${r.codigo.toLowerCase()}/`,
      );
    }
  });

  it.each(PUBLICADO)(
    "$codigo: na distância média, sem dinâmica, a corrida é o preço médio publicado",
    ({ codigo, preco, km }) => {
      expect(estimativaCorrida(km, 1, porKmDoDestino(codigo))).toBeCloseTo(preco, 2);
    },
  );

  it.each(PUBLICADO)(
    "$codigo: comparar usa o R$ por km do próprio aeroporto",
    ({ codigo, preco, km }) => {
      const dest: PriceDestination = { ...DEST, code: codigo };
      expect(comparar(dest, 7, km, 1).appTotal).toBeCloseTo(preco * 2, 2);
    },
  );

  it("GRU a 30 km fica perto dos R$ 100 que a Uber publica (antes dava cerca de R$ 73)", () => {
    const gru: PriceDestination = { ...DEST, code: "GRU" };
    expect(comparar(gru, 7, 30, 1).appTotal / 2).toBeCloseTo(100, 2);
  });

  it("a distância escala a corrida no R$ por km do aeroporto", () => {
    // Viracopos: 38 / 17 km. Barão Geraldo a 33 km dá cerca de R$ 74 (o post cita ~R$ 75).
    expect(estimativaCorrida(33, 1, porKmDoDestino("VCP"))).toBeCloseTo((38 / 17) * 33, 2);
  });

  it("aceita o código em minúsculas e não inventa referência", () => {
    expect(referenciaApp("gru")?.precoMedio).toBe(100);
    expect(referenciaApp("tiete")).toBeNull();
    expect(referenciaApp(null)).toBeNull();
  });

  it("destino sem página da Uber usa a média das praças publicadas", () => {
    const media = PUBLICADO.reduce((s, p) => s + p.preco / p.km, 0) / PUBLICADO.length;
    expect(POR_KM_MEDIO).toBeCloseTo(media, 6);
    expect(porKmDoDestino("tiete")).toBeCloseTo(media, 6);
    const tiete: PriceDestination = { ...DEST, code: "tiete" };
    expect(comparar(tiete, 7, 20, 1).appTotal).toBeCloseTo(media * 20 * 2, 2);
  });
});

describe("estimativaCorrida", () => {
  it("respeita o piso em trajeto curto", () => {
    // Afonso Pena a 2 km: 2 × 40/19 = 4,21, abaixo do piso.
    expect(estimativaCorrida(2, 1, porKmDoDestino("CWB"))).toBe(CORRIDA_MINIMA);
  });

  it("o multiplicador de tarifa dinâmica escala a corrida inteira", () => {
    expect(estimativaCorrida(30, 2, porKmDoDestino("GRU"))).toBeCloseTo(200, 2);
    expect(estimativaCorrida(30, 1.5, porKmDoDestino("GRU"))).toBeCloseTo(150, 2);
  });
});

describe("comparar", () => {
  // DEST é Guarulhos: R$ 100 por 30 km. A 15 km, a corrida é R$ 50 e a ida e volta, R$ 100.
  it("duas corridas contra o menor estacionamento da duração", () => {
    const c = comparar(DEST, 7, 15, 1);
    expect(c.appTotal).toBeCloseTo(100, 2);
    expect(c.estacionarTotal).toBe(140);
    expect(c.estacionarLabel).toBe("Parceiro (Vaga Descoberta)");
    // 7 diárias: o app ainda ganha nessa distância (100 < 140), economia negativa.
    expect(c.economia).toBeCloseTo(-40, 2);
  });

  it("a tarifa manual do usuário sobrepõe a estimativa", () => {
    const c = comparar(DEST, 7, 15, 1, { tarifaManualIda: 90 });
    expect(c.appManual).toBe(true);
    expect(c.appTotal).toBe(180);
    expect(c.economia).toBeCloseTo(40, 2);
  });

  it("o combustível entra no lado do carro quando pedido", () => {
    const c = comparar(DEST, 7, 22, 1, { incluirCombustivel: true });
    expect(c.combustivel).toBeCloseTo(custoCombustivel(22), 2);
    expect(c.economia).toBeCloseTo(c.appTotal - (140 + (c.combustivel ?? 0)), 2);
  });

  it("destino sem preço na duração devolve economia nula, sem inventar", () => {
    const semPreco: PriceDestination = { ...DEST, units: [] };
    const c = comparar(semPreco, 7, 15, 1);
    expect(c.estacionarTotal).toBeNull();
    expect(c.economia).toBeNull();
  });
});

describe("breakEvenDays", () => {
  it("acha a menor duração em que estacionar vence as duas corridas", () => {
    // Guarulhos a 30 km, sem dinâmica: ida e volta R$ 200. Estacionar: 20/d.
    // 1d=20 já vence, então o break-even é 1.
    expect(breakEvenDays(DEST, 30, 1, [1, 7, 15, 30])).toBe(1);
    // A 3 km: corrida no piso de R$ 10, ida e volta 20. 1d=20 empata (não vence); 7d=140 perde.
    expect(breakEvenDays(DEST, 3, 1, [1, 7, 15, 30])).toBeNull();
  });

  it("usa o R$ por km do aeroporto: a mesma distância vira mais cedo em Guarulhos", () => {
    const tabela = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ days: d, total: d * 30, old_total: null }));
    const units = [unit({ prices: tabela })];
    // 12 km. GRU: 40 por trecho, 80 ida e volta, então 2 diárias (60) já vencem.
    // CWB: 25,26 por trecho, 50,53 ida e volta, e nem 2 diárias (60) vencem.
    // 4 diárias (120): vencem GRU a 50 km (333,33), não vencem VCP a 20 km (89,41).
    expect(breakEvenDays({ ...DEST, code: "GRU", units }, 12, 1, [2, 3, 4])).toBe(2);
    expect(breakEvenDays({ ...DEST, code: "CWB", units }, 12, 1, [2, 3, 4])).toBeNull();
    expect(breakEvenDays({ ...DEST, code: "VCP", units }, 20, 1, [4])).toBeNull();
    expect(breakEvenDays({ ...DEST, code: "GRU", units }, 50, 1, [4])).toBe(4);
  });

  it("quando o app ganha em todas as durações, não há break-even", () => {
    const caro: PriceDestination = {
      ...DEST,
      units: [unit({ prices: [1, 7].map((d) => ({ days: d, total: d * 500, old_total: null })) })],
    };
    expect(breakEvenDays(caro, 10, 1, [1, 7])).toBeNull();
  });
});

describe("comparar: quem venceu vira recomendação", () => {
  it("expõe a unidade do menor total para o CTA de reserva", () => {
    const c = comparar(DEST, 7, 15, 1);
    expect(c.melhorUnidade?.company_slug).toBe("parceiro");
    expect(c.melhorUnidade?.parking_type_code).toBe("uncovered");
  });
});

describe("reservaWindow", () => {
  it("entrada amanhã às 22h e saída N dias depois às 08h", () => {
    const base = new Date("2026-08-16T15:00:00");
    const { from, to } = reservaWindow(base, 7);
    const f = new Date(from);
    const t = new Date(to);
    expect(f.getDate()).toBe(17);
    expect(f.getHours()).toBe(22);
    expect(t.getDate()).toBe(24);
    expect(t.getHours()).toBe(8);
    // 22h → 08h com tolerância de 60 min fecha exatamente N diárias no motor:
    // minutos = N*1440 - 840; menos 60 de tolerância ainda arredonda pra N.
    const minutos = (t.getTime() - f.getTime()) / 60000;
    expect(Math.ceil((minutos - 60) / 1440)).toBe(7);
  });
});

describe("sanitizeKm", () => {
  it("aceita inteiro entre 2 e 120", () => {
    expect(sanitizeKm("25")).toBe(25);
    expect(sanitizeKm(120)).toBe(120);
  });

  it("recusa o que não é distância de trajeto", () => {
    expect(sanitizeKm("1")).toBeNull();
    expect(sanitizeKm("121")).toBeNull();
    expect(sanitizeKm("abc")).toBeNull();
  });
});
