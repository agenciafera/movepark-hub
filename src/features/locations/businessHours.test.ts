import { describe, expect, it } from "vitest";
import {
  emptyBusinessHours,
  hasAnyHours,
  isValidTime,
  parseBusinessHours,
} from "./businessHours";

describe("isValidTime", () => {
  it("aceita HH:MM válido, recusa fora do relógio", () => {
    expect(isValidTime("07:00")).toBe(true);
    expect(isValidTime("23:59")).toBe(true);
    expect(isValidTime("00:00")).toBe(true);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("7:00")).toBe(false);
    expect(isValidTime("07:60")).toBe(false);
    expect(isValidTime("")).toBe(false);
  });
});

describe("emptyBusinessHours", () => {
  it("nasce com os 7 dias fechados, em ordem", () => {
    const h = emptyBusinessHours();
    expect(Object.keys(h)).toEqual(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
    expect(Object.values(h).every((d) => d === null)).toBe(true);
  });
});

describe("parseBusinessHours", () => {
  it("normaliza o caso do Move Parking (comercial, domingo fechado)", () => {
    const parsed = parseBusinessHours({
      mon: { open: "07:00", close: "20:00" },
      sat: { open: "08:00", close: "17:00" },
      sun: null,
    });
    expect(parsed.mon).toEqual({ open: "07:00", close: "20:00" });
    expect(parsed.sat).toEqual({ open: "08:00", close: "17:00" });
    expect(parsed.sun).toBeNull();
    expect(parsed.tue).toBeNull();
  });

  it("descarta dia com horário inválido (vira fechado)", () => {
    const parsed = parseBusinessHours({ mon: { open: "7h", close: "20:00" } });
    expect(parsed.mon).toBeNull();
  });

  it("null/objeto vazio → todos fechados", () => {
    expect(hasAnyHours(parseBusinessHours(null))).toBe(false);
    expect(hasAnyHours(parseBusinessHours({}))).toBe(false);
  });
});

describe("hasAnyHours", () => {
  it("true quando ao menos um dia tem horário", () => {
    const h = emptyBusinessHours();
    expect(hasAnyHours(h)).toBe(false);
    h.mon = { open: "07:00", close: "20:00" };
    expect(hasAnyHours(h)).toBe(true);
  });
});
