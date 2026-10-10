import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

// Faturamento por origem (fase 5): o Hub e o site white-label lado a lado, total com a quebra (D4)
// sem comissão do site (D4b revista). A conta mora em billingByOrigin.logic (testada à
// parte); aqui, que a tela mostra a quebra e que a comissão é só do Hub.
const wl = { by_company: [] as unknown[] };
vi.mock("@/features/finance/api", () => ({
  useCompanyFinance: () => ({
    data: [{ companyId: "a", companyName: "Abba", reservations: 2, grossRevenue: 200, takeRateBps: 1500 }],
    isLoading: false,
  }),
}));
vi.mock("@/features/finance/wlRevenue", () => ({
  useWlRevenue: () => ({ data: { total: {}, by_day: [], by_company: wl.by_company }, isLoading: false }),
}));

import ManagerFinanceBilling from "./finance-billing";

describe("ManagerFinanceBilling", () => {
  it("sem venda no site, a tela é a de antes", () => {
    wl.by_company = [];
    renderWithProviders(<ManagerFinanceBilling />);
    expect(screen.getByTestId("faturamento-totais")).toHaveTextContent("R$ 200,00");
    expect(screen.queryByText(/no white-label/)).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "White-label" })).not.toBeInTheDocument();
  });

  it("com venda no site: receita com a quebra, coluna do site, e comissão só do Hub", () => {
    wl.by_company = [
      { company_id: "a", company_name: "Abba", created: 5, paid: 4, paid_amount: 1000 },
      { company_id: "v", company_name: "Vira", created: 3, paid: 3, paid_amount: 900 },
    ];
    renderWithProviders(<ManagerFinanceBilling />);
    const totais = screen.getByTestId("faturamento-totais");
    expect(totais).toHaveTextContent("R$ 2.100,00");
    expect(totais).toHaveTextContent("R$ 200,00 no Hub, R$ 1.900,00 no white-label");
    // Comissão só do Hub: 15% de 200. A venda do site não tem comissão no Hub.
    expect(totais).toHaveTextContent("R$ 30,00");
    expect(totais).toHaveTextContent("só da venda pelo Hub");
    expect(screen.queryByRole("columnheader", { name: "Comissão white-label" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "White-label" })).toBeInTheDocument();
    const vira = screen.getByRole("row", { name: /Vira/ });
    // Vira só vendeu no site: as colunas do Hub ficam em traço, sem um "0%" que parece taxa.
    expect(within(vira).queryByText(/0%/)).not.toBeInTheDocument();
  });
});
