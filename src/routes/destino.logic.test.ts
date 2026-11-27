import { describe, expect, it } from "vitest";
import {
  diariaAvulsa,
  menorDiariaDoResumo,
  pickRelatedDestinations,
  pointsSummary,
} from "./destino.logic";

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

describe("diariaAvulsa", () => {
  const resumo = (byDuration: { days: number; from: number }[]) => ({ byDuration });

  it("é a diária de 1 dia, não a menor diária da tabela", () => {
    // Regressão do Conteúdo 40: em Confins o topo dizia R$ 13,33 (30 diárias da BePark por
    // R$ 400,00) enquanto a meta, o /precos e as FAQs diziam R$ 45,00.
    expect(
      diariaAvulsa(
        resumo([
          { days: 1, from: 45 },
          { days: 7, from: 200 },
          { days: 15, from: 400 },
          { days: 30, from: 400 },
        ]),
      ),
    ).toBe(45);
  });

  it("sem diária avulsa não promove o preço de outra duração", () => {
    expect(diariaAvulsa(resumo([{ days: 7, from: 174.3 }]))).toBeNull();
  });

  it("sem resumo ou com preço zero devolve null", () => {
    expect(diariaAvulsa(null)).toBeNull();
    expect(diariaAvulsa(resumo([]))).toBeNull();
    expect(diariaAvulsa(resumo([{ days: 1, from: 0 }]))).toBeNull();
  });
});

describe("menorDiariaDoResumo", () => {
  const resumo = (byDuration: { days: number; from: number }[]) => ({ byDuration });

  it("é a menor diária das estadias longas, na duração mais curta em que ela vale", () => {
    // Virapark em 27/11/2026: R$ 40,00 avulsa, R$ 29,90 por dia de 7 a 30 diárias. O topo
    // mostrava só os R$ 40,00 e escondia o preço que o próprio parceiro anuncia.
    expect(
      menorDiariaDoResumo(
        resumo([
          { days: 1, from: 40 },
          { days: 7, from: 209.3 },
          { days: 15, from: 448.5 },
          { days: 30, from: 897 },
        ]),
      ),
    ).toEqual({ daily: 29.9, days: 7 });
  });

  it("não aparece quando a estadia longa não fica mais barata que a avulsa", () => {
    expect(
      menorDiariaDoResumo(
        resumo([
          { days: 1, from: 40 },
          { days: 7, from: 280 },
          { days: 30, from: 1200 },
        ]),
      ),
    ).toBeNull();
  });

  it("sem resumo devolve null", () => {
    expect(menorDiariaDoResumo(null)).toBeNull();
    expect(menorDiariaDoResumo(resumo([]))).toBeNull();
  });
});
