import { describe, expect, it } from "vitest";
import {
  summarizeRanges,
  stayDays,
  pctDelta,
  formatDelta,
  cancellationRate,
  cancellationBenchmark,
  averageRating,
  pendingReviews,
  averageLeadTimeDays,
  fareMix,
  fareRevenueMix,
  channelMix,
  aggregateOccupancy,
  occupancyRate,
  revpar,
  fillStayBuckets,
  sharePct,
  flowTotals,
  hourLabel,
  STAY_BUCKETS,
} from "./dashboardMetrics.logic";

describe("stayDays", () => {
  it("conta dia-calendário ocupado, e a estadia no mesmo dia vale 1", () => {
    // 20 → 23 ocupa 20, 21, 22 e 23: 4 diárias, igual à convenção da capacidade.
    expect(stayDays("2026-07-20T10:00:00Z", "2026-07-23T10:00:00Z")).toBe(4);
    expect(stayDays("2026-07-20T08:00:00Z", "2026-07-20T20:00:00Z")).toBe(1);
  });

  it("check-out exatamente à meia-noite não puxa mais um dia", () => {
    expect(stayDays("2026-07-20T00:00:00Z", "2026-07-21T00:00:00Z")).toBe(1);
  });

  it("data inválida não vira NaN somado na conta", () => {
    expect(stayDays("nao-e-data", "2026-07-21T00:00:00Z")).toBe(0);
  });
});

describe("summarizeRanges", () => {
  const current = [
    {
      check_in_at: "2026-07-20T08:00:00Z",
      check_out_at: "2026-07-22T08:00:00Z",
      total_amount: 100,
    },
    {
      check_in_at: "2026-07-18T08:00:00Z",
      check_out_at: "2026-07-18T20:00:00Z",
      total_amount: "50",
    },
  ];
  const previous = [
    { check_in_at: "2026-06-20T08:00:00Z", check_out_at: "2026-06-21T08:00:00Z", total_amount: 30 },
    {
      check_in_at: "2026-06-01T08:00:00Z",
      check_out_at: "2026-06-02T08:00:00Z",
      total_amount: null,
    },
  ];

  it("soma receita, reservas, ticket e diárias de cada janela", () => {
    const { current: c, previous: p } = summarizeRanges(current, previous);
    // 3 diárias (20, 21, 22) + 1 (mesmo dia)
    expect(c).toEqual({ revenue: 150, count: 2, ticket: 75, vehicleDays: 4 });
    expect(p).toEqual({ revenue: 30, count: 2, ticket: 15, vehicleDays: 4 });
  });

  it("sem comparação, o período anterior volta zerado", () => {
    expect(summarizeRanges(current, null).previous).toEqual({
      revenue: 0,
      count: 0,
      ticket: 0,
      vehicleDays: 0,
    });
  });

  it("ticket é 0 quando não há reserva", () => {
    expect(summarizeRanges([], null).current).toEqual({
      revenue: 0,
      count: 0,
      ticket: 0,
      vehicleDays: 0,
    });
  });
});

describe("pctDelta / formatDelta", () => {
  it("calcula a variação percentual", () => {
    expect(pctDelta(150, 100)).toBe(50);
    expect(pctDelta(80, 100)).toBe(-20);
  });

  it("devolve null quando não há base (anterior 0)", () => {
    expect(pctDelta(150, 0)).toBeNull();
    expect(formatDelta(pctDelta(150, 0))).toBeUndefined();
  });

  it("formata com sinal e marca positivo/negativo", () => {
    expect(formatDelta(50)).toEqual({ value: "+50% vs anterior", positive: true });
    expect(formatDelta(-20)).toEqual({ value: "-20% vs anterior", positive: false });
    expect(formatDelta(0)).toEqual({ value: "0% vs anterior", positive: true });
  });
});

describe("cancellationRate / benchmark", () => {
  it("soma canceladas e no-show sobre o total", () => {
    const r = cancellationRate([
      { status: "confirmed", count: 6 },
      { status: "completed", count: 2 },
      { status: "cancelled", count: 1 },
      { status: "no_show", count: 1 },
    ]);
    expect(r.total).toBe(10);
    expect(r.cancelled).toBe(1);
    expect(r.noShow).toBe(1);
    expect(r.rate).toBe(20);
  });

  it("rate é 0 sem reservas", () => {
    expect(cancellationRate([]).rate).toBe(0);
  });

  it("exclui expired (abandono) e pending do denominador", () => {
    const r = cancellationRate([
      { status: "confirmed", count: 6 },
      { status: "completed", count: 2 },
      { status: "cancelled", count: 2 },
      { status: "expired", count: 90 }, // abandono: não conta
      { status: "pending", count: 5 }, // em aberto: não conta
    ]);
    expect(r.total).toBe(10); // 6 + 2 + 2
    expect(r.cancelled).toBe(2);
    expect(r.rate).toBe(20); // 2 / 10
  });

  it("classifica contra a referência de mercado", () => {
    expect(cancellationBenchmark(15).tone).toBe("good");
    expect(cancellationBenchmark(30).tone).toBe("warn");
    expect(cancellationBenchmark(55).tone).toBe("bad");
  });
});

describe("reviews", () => {
  const reviews = [
    { rating: 5, owner_response: "obrigado" },
    { rating: 3, owner_response: null },
    { rating: null, owner_response: null },
  ];

  it("nota média ignora avaliação sem nota", () => {
    expect(averageRating(reviews)).toEqual({ avg: 4, count: 2 });
  });

  it("pendentes são as sem resposta", () => {
    expect(pendingReviews(reviews)).toBe(2);
  });
});

describe("averageLeadTimeDays", () => {
  it("média de dias entre criação e check-in", () => {
    const rows = [
      { created_at: "2026-07-01T00:00:00Z", check_in_at: "2026-07-03T00:00:00Z" }, // 2 dias
      { created_at: "2026-07-01T00:00:00Z", check_in_at: "2026-07-05T00:00:00Z" }, // 4 dias
    ];
    expect(averageLeadTimeDays(rows)).toBe(3);
  });

  it("diferença negativa vira 0 e lista vazia é 0", () => {
    expect(
      averageLeadTimeDays([
        { created_at: "2026-07-05T00:00:00Z", check_in_at: "2026-07-01T00:00:00Z" },
      ]),
    ).toBe(0);
    expect(averageLeadTimeDays([])).toBe(0);
  });
});

describe("fareMix / channelMix", () => {
  it("conta por tarifa e ignora sem tarifa", () => {
    expect(
      fareMix([
        { fare_tier: "basica" },
        { fare_tier: "flex" },
        { fare_tier: "flex" },
        { fare_tier: null },
      ]),
    ).toEqual({ basica: 1, flex: 2 });
  });

  it("mix com receita da tarifa (centavos → reais), ignorando sem tarifa", () => {
    expect(
      fareRevenueMix([
        { fare_tier: "flex", fare_price_cents: 1290 },
        { fare_tier: "flex", fare_price_cents: 1290 },
        { fare_tier: "superflex", fare_price_cents: 2490 },
        { fare_tier: null, fare_price_cents: 999 },
      ]),
    ).toEqual({
      flex: { count: 2, revenue: 25.8 },
      superflex: { count: 1, revenue: 24.9 },
    });
  });

  it("separa site (fluxo próprio) de API (chave de API)", () => {
    expect(
      channelMix([
        { created_via_api_key_id: null },
        { created_via_api_key_id: "key-1" },
        { created_via_api_key_id: null },
      ]),
    ).toEqual({ site: 2, api: 1 });
  });
});

describe("ocupação e RevPAR", () => {
  it("agrega capacidade e ocupação, ignorando datas bloqueadas", () => {
    const rows = [
      { capacity: 100, booked_count: 40, blocked: false },
      { capacity: 100, booked_count: 30, blocked: false },
      { capacity: 100, booked_count: 0, blocked: true }, // bloqueada: fora da conta
    ];
    expect(aggregateOccupancy(rows)).toEqual({ capacityDays: 200, bookedDays: 70 });
  });

  it("taxa de ocupação e guarda de divisão por zero", () => {
    expect(occupancyRate(70, 200)).toBe(35);
    expect(occupancyRate(0, 0)).toBe(0);
  });

  it("RevPAR é receita por vaga-dia disponível", () => {
    expect(revpar(1000, 200)).toBe(5);
    expect(revpar(1000, 0)).toBe(0);
  });
});

describe("fillStayBuckets", () => {
  it("devolve as seis faixas na ordem, mesmo quando a RPC omite as vazias", () => {
    const out = fillStayBuckets([
      { sort: 4, bookings: 7, revenue: 900 },
      { sort: 1, bookings: 3, revenue: 100 },
    ]);
    expect(out).toHaveLength(STAY_BUCKETS.length);
    expect(out.map((b) => b.sort)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(out[0]).toMatchObject({ bookings: 3, revenue: 100 });
    expect(out[3]).toMatchObject({ bookings: 7, revenue: 900 });
    // As faixas sem reserva entram zeradas, não somem do gráfico.
    expect(out[1]).toMatchObject({ bookings: 0, revenue: 0 });
    expect(out[5]).toMatchObject({ bookings: 0, revenue: 0 });
  });

  it("lista vazia vira seis faixas zeradas", () => {
    expect(fillStayBuckets([]).every((b) => b.bookings === 0)).toBe(true);
  });
});

describe("sharePct", () => {
  it("arredonda o percentual da parte sobre o total", () => {
    expect(sharePct(25, 100)).toBe(25);
    expect(sharePct(1, 3)).toBe(33);
  });

  it("sem total, devolve zero em vez de NaN", () => {
    expect(sharePct(5, 0)).toBe(0);
  });
});

describe("flowTotals", () => {
  const hours = [
    { hour: 6, vehicles: 2, passengers: 4, pcd: 1 },
    { hour: 8, vehicles: 9, passengers: 12, pcd: 0 },
    { hour: 20, vehicles: 1, passengers: 2, pcd: 0 },
  ];

  it("soma veículos, passageiros e PCDs do dia", () => {
    expect(flowTotals(hours)).toMatchObject({ vehicles: 12, passengers: 18, pcd: 1 });
  });

  it("aponta a hora de pico e quantos carros chegaram nela", () => {
    expect(flowTotals(hours)).toMatchObject({ peakHour: 8, peakVehicles: 9 });
  });

  it("dia sem movimento não tem pico", () => {
    expect(flowTotals([{ hour: 0, vehicles: 0, passengers: 0, pcd: 0 }])).toMatchObject({
      vehicles: 0,
      peakHour: null,
    });
    expect(flowTotals([])).toMatchObject({ vehicles: 0, peakHour: null });
  });

  it("no empate fica a primeira hora", () => {
    expect(
      flowTotals([
        { hour: 7, vehicles: 3, passengers: 0, pcd: 0 },
        { hour: 15, vehicles: 3, passengers: 0, pcd: 0 },
      ]).peakHour,
    ).toBe(7);
  });
});

describe("hourLabel", () => {
  it("mostra a hora cheia com dois dígitos", () => {
    expect(hourLabel(0)).toBe("00h");
    expect(hourLabel(6)).toBe("06h");
    expect(hourLabel(23)).toBe("23h");
  });
});
