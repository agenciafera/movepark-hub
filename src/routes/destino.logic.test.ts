import { describe, expect, it } from "vitest";
import {
  lowestMatrixDaily,
  lowestPerDay,
  pickRelatedDestinations,
  pointsSummary,
} from "./destino.logic";

describe("lowestPerDay", () => {
  it("retorna o menor per_day", () => {
    expect(
      lowestPerDay([
        { price: { per_day: 40 } },
        { price: { per_day: 25 } },
        { price: { per_day: 33 } },
      ]),
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

describe("pointsSummary", () => {
  it("tira o prefixo repetido quando todos os pontos começam igual", () => {
    expect(pointsSummary(["Terminal 1", "Terminal 2", "Terminal 3"])).toBe("Terminal 1, 2 e 3");
  });

  it("mantém os nomes inteiros quando não há prefixo comum", () => {
    expect(pointsSummary(["Terminal Rodoviário", "Píer Sul"])).toBe(
      "Terminal Rodoviário e Píer Sul",
    );
  });

  it("ponto único sai como está, e lista vazia vira string vazia", () => {
    expect(pointsSummary(["Terminal Único"])).toBe("Terminal Único");
    expect(pointsSummary([])).toBe("");
  });
});

describe("lowestMatrixDaily", () => {
  const unidade = (prices: { days: number; total: number | null }[]) => ({ prices });

  it("pega a menor diária entre todas as durações, não o total de 1 diária", () => {
    // O topo da página dizia "a partir de R$ 40,00" (1 diária, a duração mais cara) logo acima
    // de cards que mostram a menor diária do lote.
    expect(
      lowestMatrixDaily([
        unidade([
          { days: 1, total: 40 },
          { days: 7, total: 174.3 },
          { days: 30, total: 747 },
        ]),
      ]),
    ).toBe(24.9);
  });

  it("compara entre unidades", () => {
    expect(
      lowestMatrixDaily([unidade([{ days: 1, total: 40 }]), unidade([{ days: 1, total: 28 }])]),
    ).toBe(28);
  });

  it("duração sem preço não conta como preço zero", () => {
    expect(
      lowestMatrixDaily([
        unidade([
          { days: 1, total: null },
          { days: 7, total: 174.3 },
        ]),
      ]),
    ).toBe(24.9);
  });

  it("sem preço nenhum devolve null", () => {
    expect(lowestMatrixDaily([])).toBeNull();
    expect(lowestMatrixDaily([{ prices: null }])).toBeNull();
    expect(lowestMatrixDaily([unidade([{ days: 1, total: 0 }])])).toBeNull();
  });
});
