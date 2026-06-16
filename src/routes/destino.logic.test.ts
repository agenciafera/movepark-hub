import { describe, expect, it } from "vitest";
import { lowestPerDay, pickRelatedDestinations } from "./destino.logic";

describe("lowestPerDay", () => {
  it("retorna o menor per_day", () => {
    expect(
      lowestPerDay([{ price: { per_day: 40 } }, { price: { per_day: 25 } }, { price: { per_day: 33 } }]),
    ).toBe(25);
  });
  it("null quando vazio", () => {
    expect(lowestPerDay([])).toBeNull();
  });
});

describe("pickRelatedDestinations", () => {
  const all = [
    { id: "a", is_popular: false, sort_order: 1 },
    { id: "b", is_popular: true, sort_order: 5 },
    { id: "c", is_popular: true, sort_order: 2 },
    { id: "cur", is_popular: true, sort_order: 0 },
    { id: "d", is_popular: false, sort_order: 3 },
  ];

  it("exclui o atual, prioriza populares e depois sort_order", () => {
    const r = pickRelatedDestinations(all, "cur").map((d) => d.id);
    expect(r).toEqual(["c", "b", "a", "d"]); // populares (c<b por sort) antes dos não-populares (a<d)
  });

  it("respeita o limite", () => {
    expect(pickRelatedDestinations(all, "cur", 2).map((d) => d.id)).toEqual(["c", "b"]);
  });
});
