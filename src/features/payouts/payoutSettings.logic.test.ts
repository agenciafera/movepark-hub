import { describe, expect, it } from "vitest";
import { coerceDay, dayOptions, intervalDayLabel } from "./payoutSettings.logic";

describe("payoutSettings.logic", () => {
  it("dayOptions por intervalo", () => {
    expect(dayOptions("Daily")).toBeNull();
    expect(dayOptions("Weekly")).toEqual([1, 2, 3, 4, 5]);
    expect(dayOptions("Monthly")).toHaveLength(31);
    expect(dayOptions("Monthly")![30]).toBe(31);
  });

  it("coerceDay força a faixa ao trocar intervalo", () => {
    expect(coerceDay("Daily", 5)).toBe(0);
    expect(coerceDay("Weekly", 9)).toBe(5);
    expect(coerceDay("Weekly", 0)).toBe(1);
    expect(coerceDay("Monthly", 99)).toBe(31);
    expect(coerceDay("Monthly", 15)).toBe(15);
  });

  it("intervalDayLabel descreve o dia", () => {
    expect(intervalDayLabel("Daily", 0)).toBe("todo dia útil");
    expect(intervalDayLabel("Weekly", 3)).toBe("Quarta");
    expect(intervalDayLabel("Monthly", 10)).toBe("dia 10 do mês");
  });
});
