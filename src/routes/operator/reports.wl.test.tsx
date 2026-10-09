import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { mockAuth, renderWithProviders } from "@/test/utils";

// Fase 5: Relatórios separam o que veio pela Movepark do que o site white-label vendeu.
const estado = { hasWl: false };
vi.mock("@/features/companies/useHasWl", () => ({ useHasWl: () => ({ hasWl: estado.hasWl, isLoading: false }) }));
vi.mock("@/features/finance/wlRevenue", () => ({
  useWlRevenue: (_args: unknown, enabled = true) => ({
    data: enabled ? { total: { created: 3, paid: 2, paid_amount: 250, commission: null }, by_day: [], by_company: [] } : undefined,
    isLoading: false,
  }),
}));

import OperatorReports from "./reports";

function render() {
  return renderWithProviders(<OperatorReports />, {
    auth: mockAuth({ effectiveCompanyIds: ["c1"], hasScope: () => true }),
    route: "/operator/reports",
  });
}

describe("OperatorReports · white-label", () => {
  it("com site: card do que foi vendido no white-label, e o Você recebe deixa claro que é pela Movepark", () => {
    estado.hasWl = true;
    render();
    expect(screen.getByTestId("relatorio-white-label")).toHaveTextContent("R$ 250,00");
    expect(screen.getByText("Você recebe pela Movepark")).toBeInTheDocument();
  });

  it("sem site: a tela de antes", () => {
    estado.hasWl = false;
    render();
    expect(screen.queryByTestId("relatorio-white-label")).not.toBeInTheDocument();
    expect(screen.getByText("Você recebe")).toBeInTheDocument();
  });
});
