import { describe, expect, it } from "vitest";
import { dailySeed, orderPopularRows, shuffleWithSeed } from "./popularOrder";

const row = (id: string, bookings_count: number) => ({ id, bookings_count });

describe("dailySeed", () => {
  it("é o dia, não o relógio: mesma data em horas diferentes dá a mesma semente", () => {
    expect(dailySeed(new Date(2026, 7, 12, 3, 15))).toBe(dailySeed(new Date(2026, 7, 12, 23, 59)));
  });

  it("muda de um dia para o outro", () => {
    expect(dailySeed(new Date(2026, 7, 12))).not.toBe(dailySeed(new Date(2026, 7, 13)));
  });
});

describe("shuffleWithSeed", () => {
  it("mesma semente, mesma ordem", () => {
    const items = ["a", "b", "c", "d", "e", "f"];
    expect(shuffleWithSeed(items, 20260812)).toEqual(shuffleWithSeed(items, 20260812));
  });

  it("sementes diferentes trocam a ordem", () => {
    const items = ["a", "b", "c", "d", "e", "f", "g", "h"];
    expect(shuffleWithSeed(items, 20260812)).not.toEqual(shuffleWithSeed(items, 20260813));
  });

  it("não perde nem duplica item, e não altera o array recebido", () => {
    const items = ["a", "b", "c", "d"];
    const out = shuffleWithSeed(items, 7);
    expect([...out].sort()).toEqual(["a", "b", "c", "d"]);
    expect(items).toEqual(["a", "b", "c", "d"]);
  });
});

describe("orderPopularRows", () => {
  it("quem vendeu mantém a ordem do ranking, na frente de todos", () => {
    const rows = [row("vendeu-37", 37), row("vendeu-12", 12), row("zero-1", 0), row("zero-2", 0)];
    const out = orderPopularRows(rows, 20260812);
    expect(out.slice(0, 2).map((r) => r.id)).toEqual(["vendeu-37", "vendeu-12"]);
    expect(out.slice(2).map((r) => r.id).sort()).toEqual(["zero-1", "zero-2"]);
  });

  it("a cauda sem venda muda de ordem conforme o dia", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`zero-${i}`, 0));
    const hoje = orderPopularRows(rows, 20260812).map((r) => r.id);
    const amanha = orderPopularRows(rows, 20260813).map((r) => r.id);
    expect(hoje).not.toEqual(amanha);
    expect([...hoje].sort()).toEqual([...amanha].sort());
  });

  it("sem a contagem, trata como sem venda em vez de sumir com a linha", () => {
    const rows = [{ id: "a" }, { id: "b", bookings_count: null }];
    expect(orderPopularRows(rows, 1)).toHaveLength(2);
  });

  it("lista vazia continua vazia", () => {
    expect(orderPopularRows([], 20260812)).toEqual([]);
  });
});
