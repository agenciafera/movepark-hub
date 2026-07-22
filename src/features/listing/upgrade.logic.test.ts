import { describe, expect, it } from "vitest";
import { pickUpgradeTarget, type TypePrice } from "./upgrade.logic";

/** Preços reais da abbapark (2 diárias): descoberta 33,80 / coberta 39,80 / premium 61,80. */
const TYPES: TypePrice[] = [
  { code: "uncovered", name: "Vaga Descoberta", price: 33.8 },
  { code: "covered", name: "Vaga Coberta", price: 39.8 },
  { code: "premium", name: "Vaga Premium", price: 61.8 },
];

describe("pickUpgradeTarget", () => {
  it("do mais barato, induz ao próximo degrau (menor salto), não ao topo", () => {
    // Descoberta → Coberta (+6), não Premium (+28).
    expect(pickUpgradeTarget("uncovered", TYPES)).toEqual({
      code: "covered",
      name: "Vaga Coberta",
      delta: 6,
    });
  });

  it("do meio, induz só pro que é mais caro", () => {
    expect(pickUpgradeTarget("covered", TYPES)).toEqual({
      code: "premium",
      name: "Vaga Premium",
      delta: 22,
    });
  });

  it("no topo, não induz nada (nunca oferece downgrade)", () => {
    expect(pickUpgradeTarget("premium", TYPES)).toBeNull();
  });

  it("tipo atual sem preço → sem nudge", () => {
    const semPreco: TypePrice[] = [
      { code: "uncovered", name: "Descoberta", price: null },
      { code: "covered", name: "Coberta", price: 39.8 },
    ];
    expect(pickUpgradeTarget("uncovered", semPreco)).toBeNull();
  });

  it("ignora candidatos sem preço simulado", () => {
    const types: TypePrice[] = [
      { code: "uncovered", name: "Descoberta", price: 33.8 },
      { code: "covered", name: "Coberta", price: null },
      { code: "premium", name: "Premium", price: 61.8 },
    ];
    expect(pickUpgradeTarget("uncovered", types)).toEqual({
      code: "premium",
      name: "Premium",
      delta: 28,
    });
  });

  it("empate de preço não conta como upgrade (mesmo valor não é 'mais caro')", () => {
    const types: TypePrice[] = [
      { code: "uncovered", name: "Descoberta", price: 33.8 },
      { code: "covered", name: "Coberta", price: 33.8 },
    ];
    expect(pickUpgradeTarget("uncovered", types)).toBeNull();
  });
});
