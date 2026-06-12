import { describe, expect, it } from "vitest";
import {
  DEFAULT_DURATIONS,
  buildPriceRows,
  durationLabel,
  durationList,
} from "./price-table.logic";
import type { SimulatedPrice } from "./api";

function sim(over: Partial<SimulatedPrice>): SimulatedPrice {
  return { price: null, old_price: null, discount: null, days: 0, error: null, ...over };
}

describe("durationList", () => {
  it("sem seleção retorna os buckets padrão ordenados", () => {
    expect(durationList()).toEqual(DEFAULT_DURATIONS);
    expect(durationList(0)).toEqual(DEFAULT_DURATIONS);
  });

  it("inclui a duração buscada quando fora dos buckets, ordenada e única", () => {
    expect(durationList(4)).toEqual([1, 2, 3, 4, 5, 7, 10, 15, 30]);
  });

  it("não duplica quando a buscada já está nos buckets", () => {
    expect(durationList(7)).toEqual(DEFAULT_DURATIONS);
  });
});

describe("durationLabel", () => {
  it("singular e plural", () => {
    expect(durationLabel(1)).toBe("1 diária");
    expect(durationLabel(5)).toBe("5 diárias");
  });
});

describe("buildPriceRows", () => {
  it("calcula por-dia, destaca a buscada e risca o old_price", () => {
    const rows = buildPriceRows(
      [1, 7],
      [sim({ price: 40, days: 1 }), sim({ price: 210, old_price: 250, days: 7 })],
      7,
    );
    expect(rows[0]).toMatchObject({ days: 1, total: 40, perDay: 40, oldPrice: null, isSelected: false });
    expect(rows[1]).toMatchObject({ days: 7, total: 210, perDay: 30, oldPrice: 250, isSelected: true });
  });

  it("old_price não maior que o total não é riscado", () => {
    const rows = buildPriceRows([3], [sim({ price: 90, old_price: 90, days: 3 })]);
    expect(rows[0].oldPrice).toBeNull();
  });

  it("resultado ausente ou com erro vira total/perDay null", () => {
    const rows = buildPriceRows([5, 10], [undefined, sim({ error: "x", days: 10 })]);
    expect(rows[0]).toMatchObject({ total: null, perDay: null });
    expect(rows[1]).toMatchObject({ total: null, perDay: null });
  });
});
