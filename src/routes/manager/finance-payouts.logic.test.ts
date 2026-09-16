import { describe, expect, it } from "vitest";
import { recentMonths } from "./finance-payouts.logic";

describe("recentMonths", () => {
  it("o rótulo é o mesmo mês do valor e do recorte (bug de 16/09/2026: dizia agosto mostrando setembro)", () => {
    const [atual, anterior] = recentMonths(2, new Date("2026-09-16T17:00:00Z"));
    expect(atual.value).toBe("2026-09");
    expect(atual.label).toBe("setembro 2026");
    expect(anterior.value).toBe("2026-08");
    expect(anterior.label).toBe("agosto 2026");
  });

  it("o mês vira à meia-noite de Brasília, não de UTC", () => {
    // 01/09 01:00 UTC ainda é 31/08 22:00 em Brasília: o mês vigente é agosto.
    const [atual] = recentMonths(1, new Date("2026-09-01T01:00:00Z"));
    expect(atual.value).toBe("2026-08");
    expect(atual.from).toBe("2026-08-01T03:00:00.000Z");
    expect(atual.to).toBe("2026-09-01T03:00:00.000Z");
  });

  it("atravessa o ano para trás sem perder o rótulo", () => {
    const meses = recentMonths(3, new Date("2027-01-10T12:00:00Z"));
    expect(meses.map((m) => m.value)).toEqual(["2027-01", "2026-12", "2026-11"]);
    expect(meses[1].label).toBe("dezembro 2026");
  });
});
