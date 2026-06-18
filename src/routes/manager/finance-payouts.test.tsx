import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { PayoutStatement } from "@/features/payouts/api";

const statement: PayoutStatement = {
  period: { from: "2026-05-01T00:00:00Z", to: "2026-06-01T00:00:00Z" },
  companies: [
    {
      company_id: "c1",
      company_name: "Aerovalet",
      gross_partner_cents: 34000,
      refunded_partner_cents: 8500,
      net_partner_cents: 25500,
      movepark_commission_cents: 4500,
      paid_count: 2,
      refunded_count: 1,
      lines: null,
    },
  ],
};

vi.mock("@/features/payouts/api", () => ({
  usePayoutStatement: () => ({ data: statement, isLoading: false }),
}));

import ManagerFinancePayouts from "./finance-payouts";

describe("ManagerFinancePayouts", () => {
  it("mostra o extrato reconciliado por empresa (líquido e comissão do split real)", () => {
    renderWithProviders(<ManagerFinancePayouts />);
    expect(screen.getByText("Aerovalet")).toBeInTheDocument();
    // líquido a repassar 25500 centavos = R$ 255,00
    expect(screen.getAllByText("R$ 255,00").length).toBeGreaterThan(0);
    // comissão Movepark 4500 = R$ 45,00
    expect(screen.getAllByText("R$ 45,00").length).toBeGreaterThan(0);
    // estorno exibido com sinal negativo
    expect(screen.getByText("−R$ 85,00")).toBeInTheDocument();
  });
});
