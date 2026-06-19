import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders, mockAuth } from "@/test/utils";

vi.mock("@/features/payouts/api", () => ({
  useRecipient: () => ({ data: { status: "active" } }),
  usePayoutBalance: () => ({ data: { balance_cents: 25500, withdrawn_cents: 10000 }, isLoading: false }),
  usePayoutStatement: () => ({
    data: {
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
          lines: [
            { booking_code: "MP-A1", event_at: "2026-05-10T13:00:00Z", status: "paid", partner_cents: 17000, movepark_cents: 3000 },
          ],
        },
      ],
    },
    isLoading: false,
  }),
  usePayoutWithdrawals: () => ({ data: [], isLoading: false }),
}));

import OperatorFinance from "./finance";

describe("OperatorFinance", () => {
  it("mostra saldo, líquido a receber e as linhas do extrato", () => {
    renderWithProviders(<OperatorFinance />, { auth: mockAuth({ effectiveCompanyIds: ["c1"] }) });
    // saldo 25500 = R$ 255,00 (aparece no saldo e no líquido)
    expect(screen.getAllByText("R$ 255,00").length).toBeGreaterThan(0);
    // status do recebedor
    expect(screen.getByText("Apto a receber")).toBeInTheDocument();
    // linha do extrato
    expect(screen.getByText("MP-A1")).toBeInTheDocument();
    // NF como placeholder
    expect(screen.getByText(/camada fiscal/i)).toBeInTheDocument();
  });

  it("sem empresa vinculada → estado vazio", () => {
    renderWithProviders(<OperatorFinance />, { auth: mockAuth({ effectiveCompanyIds: [] }) });
    expect(screen.getByText("Empresa não encontrada")).toBeInTheDocument();
  });
});
