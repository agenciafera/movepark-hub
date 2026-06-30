import { describe, expect, it } from "vitest";
import { addOnsTotal, bookingTotal, selectedAddOns, type AddOnOption } from "./reservation.logic";

const OPTS: AddOnOption[] = [
  { id: "a", name: "Lava-jato", description: null, price: 30 },
  { id: "b", name: "Enceramento", description: null, price: 20 },
  { id: "c", name: "Detalhe", description: null, price: 50 },
];

describe("selectedAddOns", () => {
  it("filtra preservando a ordem do catálogo", () => {
    expect(selectedAddOns(OPTS, ["c", "a"]).map((o) => o.id)).toEqual(["a", "c"]);
  });
  it("vazio quando nada selecionado", () => {
    expect(selectedAddOns(OPTS, [])).toEqual([]);
  });
});

describe("addOnsTotal", () => {
  it("soma os selecionados", () => {
    expect(addOnsTotal(OPTS, ["a", "b"])).toBe(50);
  });
  it("ignora ids inexistentes", () => {
    expect(addOnsTotal(OPTS, ["a", "x"])).toBe(30);
  });
});

describe("bookingTotal", () => {
  it("desconto incide só no estacionamento; add-ons por cima", () => {
    expect(bookingTotal(100, 10, 50)).toBe(140);
  });
  it("desconto não deixa o estacionamento negativo", () => {
    expect(bookingTotal(30, 50, 20)).toBe(20);
  });
  it("sem desconto nem add-ons retorna o preço", () => {
    expect(bookingTotal(80, 0, 0)).toBe(80);
  });
  it("soma a Tarifa (E2.8) por cima", () => {
    expect(bookingTotal(100, 10, 50, 12.9)).toBe(152.9);
    expect(bookingTotal(80, 0, 0, 24.9)).toBe(104.9);
    expect(bookingTotal(80, 0, 0)).toBe(80); // sem tarifa = comportamento antigo
  });
});
