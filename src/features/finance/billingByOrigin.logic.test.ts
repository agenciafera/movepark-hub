import { describe, expect, it } from "vitest";
import { billingRows, billingTotals } from "./billingByOrigin.logic";

const hub = [
  { companyId: "a", companyName: "Abba", reservations: 2, grossRevenue: 200, takeRateBps: 1500 },
  { companyId: "b", companyName: "Bepa", reservations: 1, grossRevenue: 100, takeRateBps: 1000 },
];
const wl = [
  { company_id: "a", company_name: "Abba", created: 5, paid: 4, paid_amount: 1000 },
  { company_id: "v", company_name: "Vira", created: 3, paid: 3, paid_amount: 900 },
];

describe("billingRows", () => {
  it("junta as origens por empresa, inclusive quem só vendeu no site", () => {
    const rows = billingRows(hub, wl);
    expect(rows.map((r) => r.companyId)).toEqual(["a", "v", "b"]);
    expect(rows[0]).toMatchObject({ hubGross: 200, hubCommission: 30, hubPayout: 170, wlPaidAmount: 1000 });
    expect(rows[1]).toMatchObject({ hubGross: 0, wlPaidAmount: 900 });
  });
});

describe("billingTotals", () => {
  it("receita com a quebra; comissão só do Hub (a venda do site não tem comissão no Hub)", () => {
    expect(billingTotals(billingRows(hub, wl))).toEqual({ gross: 2200, hubGross: 300, wlGross: 1900, commission: 40 });
  });
});
