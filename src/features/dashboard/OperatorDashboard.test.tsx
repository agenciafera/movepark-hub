import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import OperatorDashboard from "./OperatorDashboard";

/**
 * ADR-005: o dashboard espelha o escopo, igual à sidebar. Achado da verificação da Q-015
 * (blindar a visão do parceiro sensível). O papel Operação não vê dinheiro; o Financeiro
 * não vê avaliações.
 */
function renderWithScopes(scopes: string[]) {
  const set = new Set(scopes);
  return renderWithProviders(<OperatorDashboard />, {
    auth: mockAuth({
      session: mockSession("company_operator"),
      effectiveCompanyIds: ["c1"],
      hasScope: (s) => set.has(s),
    }),
    route: "/operator",
  });
}

const ALL = [
  "finance:read",
  "payouts:read",
  "reviews:read",
  "bookings:read",
  "occupancy:read",
];

describe("OperatorDashboard: escopo dos cards", () => {
  it("com finance/payouts/reviews: mostra dinheiro e avaliações", () => {
    renderWithScopes(ALL);
    expect(screen.getByText("Receita (30 dias)")).toBeInTheDocument();
    expect(screen.getByText("Saldo a repassar")).toBeInTheDocument();
    expect(screen.getByText("Avaliações")).toBeInTheDocument();
  });

  it("papel Operação (sem finance/payouts/reviews): esconde dinheiro e avaliações", () => {
    renderWithScopes(["bookings:read", "occupancy:read"]);
    // Operacional continua
    expect(screen.getByText("Reservas (30 dias)")).toBeInTheDocument();
    expect(screen.getByText("Ocupação (próx. 7 dias)")).toBeInTheDocument();
    // Dinheiro some
    expect(screen.queryByText("Receita (30 dias)")).not.toBeInTheDocument();
    expect(screen.queryByText("Ticket médio")).not.toBeInTheDocument();
    expect(screen.queryByText(/RevPAR/)).not.toBeInTheDocument();
    expect(screen.queryByText("Saldo a repassar")).not.toBeInTheDocument();
    // Avaliações some
    expect(screen.queryByText("Avaliações")).not.toBeInTheDocument();
  });

  it("papel Financeiro (sem reviews): mostra dinheiro, esconde avaliações", () => {
    renderWithScopes(["finance:read", "payouts:read", "bookings:read", "occupancy:read"]);
    expect(screen.getByText("Receita (30 dias)")).toBeInTheDocument();
    expect(screen.getByText("Saldo a repassar")).toBeInTheDocument();
    expect(screen.queryByText("Avaliações")).not.toBeInTheDocument();
  });
});
