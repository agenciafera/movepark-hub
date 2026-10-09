import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

// Faturamento por origem (fase 5): o Hub e o site white-label lado a lado, total com a quebra (D4)
// e a comissão do site pela taxa própria (D4b). A conta mora em billingByOrigin.logic (testada à
// parte); aqui, que a tela mostra a quebra e avisa de venda no site sem taxa combinada.
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

  it("com venda no site: total com a quebra, colunas do site e aviso de quem não tem taxa", () => {
    wl.by_company = [
      { company_id: "a", company_name: "Abba", created: 5, paid: 4, paid_amount: 1000, wl_take_rate_bps: 500, commission: 50 },
      { company_id: "v", company_name: "Vira", created: 3, paid: 3, paid_amount: 900, wl_take_rate_bps: null, commission: null },
    ];
    renderWithProviders(<ManagerFinanceBilling />);
    const totais = screen.getByTestId("faturamento-totais");
    expect(totais).toHaveTextContent("R$ 2.100,00");
    expect(totais).toHaveTextContent("R$ 200,00 no Hub, R$ 1.900,00 no white-label");
    // Comissão: 30 do Hub (15% de 200) + 50 do site.
    expect(totais).toHaveTextContent("R$ 80,00");
    expect(screen.getByRole("columnheader", { name: "White-label" })).toBeInTheDocument();
    const vira = screen.getByRole("row", { name: /Vira/ });
    expect(within(vira).getByText("sem taxa")).toBeInTheDocument();
    expect(screen.getByTestId("aviso-sem-taxa")).toHaveTextContent("Uma empresa vendeu no white-label sem comissão combinada");
  });
});
