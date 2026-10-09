import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";

// Comissão do white-label por empresa (D4b, fase 5): coluna só para empresa com site, vazia =
// não combinada (null), zero é decisão. Quem grava é o servidor (set_company_wl_take_rate, pgTAP).
const setWl = vi.fn().mockResolvedValue({});
vi.mock("@/features/companies/api", () => ({
  useCompanies: () => ({
    data: [
      { id: "a", name: "Abba", take_rate_bps: 1500, wl_domain: "abba.movepark.co", wl_take_rate_bps: null },
      { id: "b", name: "Beta", take_rate_bps: 1000, wl_domain: null, wl_take_rate_bps: null },
    ],
    isLoading: false,
  }),
  useSetCompanyTakeRate: () => ({ mutateAsync: vi.fn() }),
  useSetCompanyWlTakeRate: () => ({ mutateAsync: setWl }),
}));
vi.mock("@/features/commission/CommissionRulesCard", () => ({ CommissionRulesCard: () => null }));
vi.mock("@/features/commission/ChannelReportCard", () => ({ ChannelReportCard: () => null }));

import ManagerFinanceCommissions from "./finance-commissions";

describe("ManagerFinanceCommissions · white-label", () => {
  it("só empresa com site edita a comissão do white-label, e grava em basis points", async () => {
    renderWithProviders(<ManagerFinanceCommissions />);
    expect(screen.getByRole("columnheader", { name: "White-label (%)" })).toBeInTheDocument();
    expect(screen.getByText("sem site")).toBeInTheDocument();
    expect(screen.queryByLabelText("Comissão do white-label de Beta em porcentagem")).not.toBeInTheDocument();

    const campo = screen.getByLabelText("Comissão do white-label de Abba em porcentagem");
    expect(campo).toHaveValue(null);
    await userEvent.type(campo, "7.5");
    const salvar = screen.getAllByRole("button", { name: "Salvar" })[1];
    expect(salvar).toBeEnabled();
    await userEvent.click(salvar);
    expect(setWl).toHaveBeenCalledWith({ companyId: "a", wlTakeRateBps: 750 });
  });
});
