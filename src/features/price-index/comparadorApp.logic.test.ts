import { describe, expect, it } from "vitest";

import {
  breakEvenDays,
  comparar,
  custoCombustivel,
  estimativaCorrida,
  minutosEstimados,
  reservaWindow,
  sanitizeKm,
  TARIFA_APP_PADRAO,
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
  code: "TST",
  name: "Aeroporto Teste",
  short_name: "Teste (TST)",
  type: "airport",
  city: "Testópolis",
  state: "TS",
  units: [unit({}), unit({ company_slug: "caro", company_name: "Caro Park", prices: [1, 7, 15, 30].map((d) => ({ days: d, total: d * 40, old_total: null })) })],
};

describe("estimativaCorrida", () => {
  it("aplica bandeirada + km + minutos estimados a 30 km/h", () => {
    // 20 km: 2,50 + 1,65*20 + 0,35*40min = 49,50
    expect(estimativaCorrida(20, 1)).toBeCloseTo(49.5, 2);
    expect(minutosEstimados(20)).toBe(40);
  });

  it("respeita a tarifa mínima em trajeto curto", () => {
    // 2 km: 2,50 + 3,30 + 1,40 = 7,20 < mínima 10
    expect(estimativaCorrida(2, 1)).toBe(TARIFA_APP_PADRAO.minima);
  });

  it("o multiplicador de tarifa dinâmica escala a corrida inteira", () => {
    expect(estimativaCorrida(20, 2)).toBeCloseTo(99, 2);
  });
});

describe("comparar", () => {
  it("duas corridas contra o menor estacionamento da duração", () => {
    const c = comparar(DEST, 7, 20, 1);
    expect(c.appTotal).toBeCloseTo(99, 2);
    expect(c.estacionarTotal).toBe(140);
    expect(c.estacionarLabel).toBe("Parceiro (Vaga Descoberta)");
    // 7 diárias: o app ainda ganha nessa distância (99 < 140), economia negativa.
    expect(c.economia).toBeCloseTo(-41, 2);
  });

  it("a tarifa manual do usuário sobrepõe a estimativa", () => {
    const c = comparar(DEST, 7, 20, 1, { tarifaManualIda: 90 });
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
    const c = comparar(semPreco, 7, 20, 1);
    expect(c.estacionarTotal).toBeNull();
    expect(c.economia).toBeNull();
  });
});

describe("breakEvenDays", () => {
  it("acha a menor duração em que estacionar vence as duas corridas", () => {
    // App a 40 km, sem dinâmica: corrida 96,50, ida e volta 193. Estacionar: 20/d.
    // 1d=20 já vence, então o break-even é 1.
    expect(breakEvenDays(DEST, 40, 1, [1, 7, 15, 30])).toBe(1);
    // A 5 km: corrida mínima ~14,25; ida e volta 28,50. 1d=20 vence de novo.
    expect(breakEvenDays(DEST, 5, 1, [1, 7, 15, 30])).toBe(1);
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
    const c = comparar(DEST, 7, 20, 1);
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
