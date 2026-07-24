import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { mockAuth, renderWithProviders } from "@/test/utils";
import OperatorReports from "./reports";

/**
 * ADR-005: Receita é financeiro. A aba Receita (e o export de receita) exige finance:read;
 * a aba Reservas (funil) fica para todos. Achado da verificação da Q-015.
 */
function renderWithFinance(canFinance: boolean) {
  return renderWithProviders(<OperatorReports />, {
    auth: mockAuth({
      effectiveCompanyIds: ["c1"],
      hasScope: (s) => (s === "finance:read" ? canFinance : true),
    }),
    route: "/operator/reports",
  });
}

describe("OperatorReports: escopo das abas", () => {
  it("com finance:read: a aba Receita aparece", () => {
    renderWithFinance(true);
    expect(screen.getByRole("tab", { name: "Receita" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Reservas" })).toBeInTheDocument();
  });

  it("sem finance:read (papel Operação): a aba Receita some, o funil fica", () => {
    renderWithFinance(false);
    expect(screen.queryByRole("tab", { name: "Receita" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Reservas" })).toBeInTheDocument();
  });
});
