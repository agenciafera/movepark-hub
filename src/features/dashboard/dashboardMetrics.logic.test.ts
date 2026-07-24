import { describe, expect, it } from "vitest";
import {
  summarizePeriod,
  pctDelta,
  formatDelta,
  cancellationRate,
  cancellationBenchmark,
  averageRating,
  pendingReviews,
} from "./dashboardMetrics.logic";

describe("summarizePeriod", () => {
  const rows = [
    { check_in_at: "2026-07-20T08:00:00Z", total_amount: 100 }, // atual
    { check_in_at: "2026-07-18T08:00:00Z", total_amount: "50" }, // atual (string)
    { check_in_at: "2026-07-05T08:00:00Z", total_amount: 30 }, // anterior
    { check_in_at: "2026-07-01T08:00:00Z", total_amount: null }, // anterior, sem valor
  ];

  it("separa atual e anterior e calcula receita, contagem e ticket", () => {
    const { current, previous } = summarizePeriod(rows, "2026-07-15T00:00:00Z");
    expect(current).toEqual({ revenue: 150, count: 2, ticket: 75 });
    expect(previous).toEqual({ revenue: 30, count: 2, ticket: 15 });
  });

  it("ticket é 0 quando não há reserva", () => {
    expect(summarizePeriod([], "2026-07-15T00:00:00Z").current).toEqual({
      revenue: 0,
      count: 0,
      ticket: 0,
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
