import { describe, expect, it } from "vitest";
import { parkingTypeChipClass, PARKING_TYPE_CHIP_FALLBACK } from "./parkingTypeStyle";

const KNOWN = ["covered", "uncovered", "valet", "garage", "motorcycle", "premium"];

describe("parkingTypeChipClass", () => {
  it("dá uma cor distinta por tipo conhecido (nenhum repete, nenhum cai no fallback)", () => {
    const classes = KNOWN.map(parkingTypeChipClass);
    expect(new Set(classes).size).toBe(KNOWN.length);
    for (const c of classes) expect(c).not.toBe(PARKING_TYPE_CHIP_FALLBACK);
  });

  it("é consistente: a mesma entrada devolve sempre a mesma cor", () => {
    expect(parkingTypeChipClass("valet")).toBe(parkingTypeChipClass("valet"));
  });

  it("não usa o violeta da marca em nenhum tipo (reservado a acionável)", () => {
    for (const code of KNOWN) {
      expect(parkingTypeChipClass(code)).not.toMatch(/mp-primary|mp-indigo|violet/);
    }
  });

  it("cai no fallback neutro para código desconhecido, nulo ou indefinido", () => {
    expect(parkingTypeChipClass("qualquer-coisa")).toBe(PARKING_TYPE_CHIP_FALLBACK);
    expect(parkingTypeChipClass(null)).toBe(PARKING_TYPE_CHIP_FALLBACK);
    expect(parkingTypeChipClass(undefined)).toBe(PARKING_TYPE_CHIP_FALLBACK);
  });
});
