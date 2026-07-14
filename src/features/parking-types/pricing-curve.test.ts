import { describe, expect, it } from "vitest";
import { findCurveInversions, type CurveRow } from "./pricing-curve";

function row(days: number, price: number | null, error: string | null = null): CurveRow {
  return { days, price, oldPrice: null, error };
}

describe("findCurveInversions", () => {
  it("não acusa nada numa curva que só sobe", () => {
    const rows = [row(1, 40), row(2, 59.8), row(7, 125.3), row(15, 298.5)];
    expect(findCurveInversions(rows)).toEqual([]);
  });

  it("acusa quando ficar mais dias sai mais barato", () => {
    // Caso real do Virapark: 6 dias (R$ 179,40) mais caro que 7 dias (R$ 125,30).
    const rows = [row(5, 149.5), row(6, 179.4), row(7, 125.3), row(10, 179)];
    expect(findCurveInversions(rows)).toEqual([
      { days: 6, price: 179.4, nextDays: 7, nextPrice: 125.3 },
    ]);
  });

  it("acha todas as inversões, não só a primeira", () => {
    const rows = [row(1, 100), row(2, 90), row(3, 200), row(4, 150)];
    expect(findCurveInversions(rows)).toEqual([
      { days: 1, price: 100, nextDays: 2, nextPrice: 90 },
      { days: 3, price: 200, nextDays: 4, nextPrice: 150 },
    ]);
  });

  it("preço igual entre durações não é inversão", () => {
    const rows = [row(1, 50), row(2, 50), row(3, 50)];
    expect(findCurveInversions(rows)).toEqual([]);
  });

  it("ignora linhas sem preço e compara as vizinhas válidas", () => {
    const rows = [row(1, 100), row(2, null, "Tipo de vaga não encontrado"), row(3, 80)];
    expect(findCurveInversions(rows)).toEqual([
      { days: 1, price: 100, nextDays: 3, nextPrice: 80 },
    ]);
  });

  it("aguenta curva vazia", () => {
    expect(findCurveInversions([])).toEqual([]);
  });
});
