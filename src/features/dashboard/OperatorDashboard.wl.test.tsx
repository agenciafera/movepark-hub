import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";

// Fase 5: o estacionamento com site white-label vê a receita das duas origens, com a quebra, e o
// site na Origem das reservas. O que não tem não vê nada disso (regra do § 2 da spec).
const estado = { hasWl: false };
vi.mock("@/features/companies/useHasWl", () => ({ useHasWl: () => ({ hasWl: estado.hasWl, isLoading: false }) }));
vi.mock("@/features/finance/wlRevenue", () => ({
  useWlRevenue: (_args: unknown, enabled = true) => ({
    data: enabled
      ? { total: { created: 5, paid: 4, paid_amount: 480 }, by_day: [{ day: "2026-07-29", paid: 4, paid_amount: 480 }], by_company: [] }
      : undefined,
    isLoading: false,
  }),
}));

import OperatorDashboard from "./OperatorDashboard";

function render() {
  return renderWithProviders(<OperatorDashboard />, {
    auth: mockAuth({
      session: mockSession("company_operator"),
      effectiveCompanyIds: ["c1"],
      hasScope: () => true,
    }),
    route: "/operator",
  });
}

describe("OperatorDashboard · white-label", () => {
  it("com site: receita com a quebra e o site na origem das reservas", async () => {
    estado.hasWl = true;
    render();
    expect(await screen.findByTestId("receita-por-origem")).toHaveTextContent("R$ 480,00 no white-label");
    expect(screen.getByTestId("origem-white-label")).toHaveTextContent("4");
  });

  it("sem site: nenhuma menção a white-label", async () => {
    estado.hasWl = false;
    render();
    expect(await screen.findByText("Receita do período")).toBeInTheDocument();
    expect(screen.queryByTestId("receita-por-origem")).not.toBeInTheDocument();
    expect(screen.queryByTestId("origem-white-label")).not.toBeInTheDocument();
    expect(screen.queryByText(/white-label/i)).not.toBeInTheDocument();
  });
});
