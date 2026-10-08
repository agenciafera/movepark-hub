import { describe, expect, it } from "vitest";
import { tallyRevenue } from "./api";

const pago = {
  status: "paid", method: "pix", amount: 136.5, installments: 1, created_at: "2026-10-08T13:10:00Z", paid_at: "2026-10-08T13:10:00Z",
  split: [{ role: "partner", amount: 8928 }, { role: "movepark", amount: 4722 }], split_sent_to_gateway: true,
  debt_recovered_cents: 0, gateway_fee_cents: 0, partner_release_at: null, refunded_amount: null, refund_absorbed_by_master: false, refund_partner_cents: 0,
};
const pb = { days: 4, line_items: [{ kind: "parking", subtotal: 111.6 }, { kind: "fare", tier: "superflex", subtotal: 24.9 }] };

describe("tallyRevenue (relatório do parceiro, 08/10/2026)", () => {
  it("soma diárias e líquido por dia; o plano fica de fora da conta do parceiro", () => {
    const rows = tallyRevenue([
      { check_in_at: "2026-10-10T08:30:00Z", total_amount: 136.5, price_breakdown: pb, payments: [pago] },
      { check_in_at: "2026-10-10T20:00:00Z", total_amount: 136.5, price_breakdown: pb, payments: [pago] },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(2);
    expect(rows[0].total).toBeCloseTo(273);
    expect(rows[0].parking).toBeCloseTo(223.2);
    expect(rows[0].net).toBeCloseTo(178.56);
  });

  it("sem detalhamento nem pagamento (visão do Manager), diárias caem no total e o líquido fica zero", () => {
    const [r] = tallyRevenue([{ check_in_at: "2026-10-10T08:30:00Z", total_amount: 50 }]);
    expect(r).toEqual({ date: "2026-10-10", total: 50, parking: 50, net: 0, count: 1 });
  });
});
