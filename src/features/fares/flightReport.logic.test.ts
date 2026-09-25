import { describe, expect, it } from "vitest";
import { monthLabel, summarizeFlightMonths } from "./flightReport.logic";

describe("summarizeFlightMonths", () => {
  it("soma as empresas do mesmo mês e ordena do mais novo", () => {
    const rows = [
      { month: "2026-08-01", company_id: "a", claims: 1, delay: 1, cancellation: 0, partner_credit_cents: 2160, overage_cents: 0, overage_charged_cents: 0 },
      { month: "2026-09-01", company_id: "a", claims: 2, delay: 1, cancellation: 1, partner_credit_cents: 4320, overage_cents: 2700, overage_charged_cents: 2700 },
      { month: "2026-09-01", company_id: "b", claims: 1, delay: 0, cancellation: 1, partner_credit_cents: 1000, overage_cents: 5400, overage_charged_cents: null },
      { month: null, company_id: "c", claims: 9, delay: 9, cancellation: 0, partner_credit_cents: 0, overage_cents: 0, overage_charged_cents: 0 },
    ];
    expect(summarizeFlightMonths(rows)).toEqual([
      { month: "2026-09-01", claims: 3, delay: 1, cancellation: 2, creditCents: 5320, overageCents: 8100, chargedCents: 2700 },
      { month: "2026-08-01", claims: 1, delay: 1, cancellation: 0, creditCents: 2160, overageCents: 0, chargedCents: 0 },
    ]);
    expect(summarizeFlightMonths(undefined)).toEqual([]);
  });
});

describe("monthLabel", () => {
  it("abrevia o mês em português", () => {
    expect(monthLabel("2026-09-01")).toBe("set/2026");
    expect(monthLabel("2026-12-01")).toBe("dez/2026");
  });
});
