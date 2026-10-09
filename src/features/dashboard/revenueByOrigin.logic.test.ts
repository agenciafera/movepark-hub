import { describe, expect, it } from "vitest";
import { mergeDailyByOrigin, originBreakdown } from "./revenueByOrigin.logic";

describe("mergeDailyByOrigin", () => {
  it("junta os dias das duas origens, inclusive o dia que só o site vendeu", () => {
    const r = mergeDailyByOrigin(
      [{ date: "2027-11-10", value: 100 }, { date: "2027-11-12", value: 50.1 }],
      [{ day: "2027-11-10", paid_amount: 30 }, { day: "2027-11-11", paid_amount: 20.2 }],
    );
    expect(r).toEqual([
      { date: "2027-11-10", hub: 100, wl: 30, total: 130 },
      { date: "2027-11-11", hub: 0, wl: 20.2, total: 20.2 },
      { date: "2027-11-12", hub: 50.1, wl: 0, total: 50.1 },
    ]);
  });
});

describe("originBreakdown", () => {
  const brl = (v: number) => `R$${v}`;
  it("só fala de origem quando o site vendeu", () => {
    expect(originBreakdown(100, 0, brl)).toBeNull();
    expect(originBreakdown(100, 30, brl)).toBe("R$100 no Hub, R$30 no white-label");
  });
});
