import { describe, expect, it } from "vitest";
import { lowestPerDay, pickRelatedDestinations, pickTopRated } from "./destino.logic";

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

describe("pickTopRated", () => {
  const item = (id: string, avg: number | null, count: number) => ({
    id,
    location: { review_avg: avg, review_count: count },
  });

  it("só entra quem já foi avaliado", () => {
    const r = pickTopRated([item("a", 4.9, 0), item("b", null, 0), item("c", 4.1, 3)]);
    expect(r.map((i) => i.id)).toEqual(["c"]);
  });

  it("ordena por nota desc e corta no limite", () => {
    // A semente do build chega ordenada por PREÇO. Sem reordenar aqui, o bloco "Mais bem
    // avaliados" sairia no HTML em ordem de preço e trocaria de ordem quando a busca
    // respondesse, na frente de quem está lendo.
    const r = pickTopRated(
      [item("c", 4.1, 3), item("a", 4.9, 10), item("b", 4.5, 2), item("d", 3.2, 1), item("e", 5, 1)],
      3,
    );
    expect(r.map((i) => i.id)).toEqual(["e", "a", "b"]);
  });

  it("lista vazia devolve vazia", () => {
    expect(pickTopRated([])).toEqual([]);
  });
});
