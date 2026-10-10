import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

vi.mock("@/features/attribution/api", () => ({
  useBookingAttribution: () => ({
    data: {
      totals: { hub: 30, external: 10, total: 40 },
      by_origin: [
        { origin: "hub_search", count: 18, confirmed: 12 },
        { origin: "white_label", count: 10, confirmed: 9 },
      ],
      by_utm_source: [{ utm_source: "google", count: 14 }],
    },
    isLoading: false,
  }),
  useExternalExitClicks: () => ({
    data: [
      {
        company_slug: "aeropark",
        company_name: "Aeropark",
        location_slug: "aeroporto-guarulhos",
        parking_type_code: "covered",
        parking_type_name: "Vaga Coberta",
        clicks: 9,
        sessions: 6,
        last_click_at: "2026-08-10T17:41:29.115Z",
      },
      {
        company_slug: "abbapark",
        company_name: "Abbapark",
        location_slug: "aeroporto-afonso-pena",
        parking_type_code: "uncovered",
        parking_type_name: "Vaga Descoberta",
        clicks: 3,
        sessions: 3,
        last_click_at: "2026-08-09T10:00:00.000Z",
      },
    ],
    isLoading: false,
  }),
}));

// Site white-label (fase 5): por padrão zero, para os testes antigos seguirem iguais.
const wlCreated = { value: 0 };
vi.mock("@/features/finance/wlRevenue", () => ({
  useWlRevenue: () => ({
    data: { total: { created: wlCreated.value, paid: 0, paid_amount: 0 }, by_day: [], by_company: [] },
    isLoading: false,
  }),
}));

import ManagerAttribution from "./attribution";

describe("ManagerAttribution", () => {
  it("mostra hub × white-label com % e as tabelas de origem/utm", () => {
    renderWithProviders(<ManagerAttribution />);
    // 30 hub = 75% do total (40)
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("75% do total")).toBeInTheDocument();
    expect(screen.getByText("25% do total")).toBeInTheDocument();
    // linha por origem + utm
    expect(screen.getByText("hub_search")).toBeInTheDocument();
    expect(screen.getByText("google")).toBeInTheDocument();
  });

  it("soma o funil de saída e mostra os cliques por sessão", () => {
    renderWithProviders(<ManagerAttribution />);
    // 9 + 3 cliques em 6 + 3 sessões = 12 cliques, 9 sessões, 1.3 por sessão.
    // Escopado ao card: "12" também é o `confirmed` de uma linha da tabela de origem, e um
    // getByText solto passaria a medir a coisa errada.
    const cliques = screen.getByText("Cliques de saída").closest("div")!.parentElement!;
    expect(within(cliques).getByText("12")).toBeInTheDocument();

    const sessoes = screen.getByText("Sessões distintas").closest("div")!.parentElement!;
    expect(within(sessoes).getByText("9")).toBeInTheDocument();
    expect(screen.getByText("1.3 cliques por sessão")).toBeInTheDocument();
  });

  it("nomeia a unidade externa e o tipo de vaga na tabela de saída", () => {
    renderWithProviders(<ManagerAttribution />);
    expect(screen.getByText("Aeropark")).toBeInTheDocument();
    expect(screen.getByText("Vaga Coberta")).toBeInTheDocument();
    expect(screen.getByText("Abbapark")).toBeInTheDocument();
  });

  it("diz que o Hub não enxerga a venda do outro lado", () => {
    // O número de cliques sozinho convida a leitura errada ("saíram 12, então vendemos 12").
    // A ressalva é parte da métrica, não enfeite.
    renderWithProviders(<ManagerAttribution />);
    expect(screen.getByText(/não vê quantas viraram venda/)).toBeInTheDocument();
  });

  it("API e agentes deixam de se chamar white-label, e o site do parceiro entra como origem própria", () => {
    wlCreated.value = 10;
    renderWithProviders(<ManagerAttribution />);
    expect(screen.queryByText("Reservas via white-label")).not.toBeInTheDocument();
    expect(screen.getByText("Pela API e agentes")).toBeInTheDocument();
    expect(screen.getByText("No site white-label")).toBeInTheDocument();
    // 30 Hub + 10 API + 10 site = 50: Hub 60%, API e site 20% cada.
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("60% do total")).toBeInTheDocument();
    expect(screen.getAllByText("20% do total")).toHaveLength(2);
    wlCreated.value = 0;
  });
});
