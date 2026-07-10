import { describe, expect, it } from "vitest";
import { coerceDay, dayOptions, intervalDayLabel } from "./payoutSettings.logic";

describe("payoutSettings.logic", () => {
  it("dayOptions por intervalo (mensal = só dias seguros, ≤28)", () => {
    expect(dayOptions("Daily")).toBeNull();
    expect(dayOptions("Weekly")).toEqual([1, 2, 3, 4, 5]);
    expect(dayOptions("Monthly")).toEqual([1, 5, 10, 15, 20, 25, 28]);
  });

  it("coerceDay snapa pro dia válido mais próximo", () => {
    expect(coerceDay("Daily", 5)).toBe(0);
    expect(coerceDay("Weekly", 9)).toBe(5);
    expect(coerceDay("Weekly", 0)).toBe(1);
    expect(coerceDay("Monthly", 15)).toBe(15); // já é válido
    expect(coerceDay("Monthly", 31)).toBe(28); // fevereiro-safe
    expect(coerceDay("Monthly", 30)).toBe(28);
    expect(coerceDay("Monthly", 0)).toBe(1);
    expect(coerceDay("Monthly", 12)).toBe(10); // mais próximo de 10/15
  });

  it("intervalDayLabel descreve o dia", () => {
    expect(intervalDayLabel("Daily", 0)).toBe("todo dia útil");
    expect(intervalDayLabel("Weekly", 3)).toBe("Quarta");
    expect(intervalDayLabel("Monthly", 10)).toBe("dia 10 do mês");
  });
});
