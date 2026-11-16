import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import ManagerDashboard from "./ManagerDashboard";
import { ManagerFiltersContext } from "@/features/manager-filters/context";
import {
  DEFAULT_PERIOD,
  resolveCompare,
  resolvePeriod,
} from "@/features/manager-filters/managerFilters.logic";
import type { ManagerOverview } from "@/types/domain";

const SUPABASE_URL = "http://localhost:54321";

/** Retrato da rede real: duas unidades vendendo e o resto parado. */
const OVERVIEW: ManagerOverview = {
  current: {
    bookings: 51,
    revenue: 1440.4,
    ticket: 28.24,
    vehicle_days: 101,
    revenue_per_vehicle_day: 14.26,
    avg_stay_days: 2,
    passengers: 12,
    pcd: 0,
    fare_revenue: 464.7,
  },
  previous: { bookings: 40, revenue: 1200, ticket: 30, vehicle_days: 80 },
  statuses: { total: 60, cancelled: 5, no_show: 1, expired: 3, pending: 0 },
  customers: { new: 6, returning: 45 },
  network: { locations_total: 30, locations_with_revenue: 2 },
  money: { commission: 262.03, payout: 1178.37 },
  by_destination: [
    { code: "VCP", name: "Viracopos", bookings: 12, revenue: 919.3, vehicle_days: 23 },
  ],
  length_of_stay: [
    { sort: 1, bookings: 6, revenue: 100, vehicle_days: 6 },
    { sort: 2, bookings: 44, revenue: 1300, vehicle_days: 90 },
  ],
  by_fare: [
    { tier: "superflex", bookings: 14, revenue: 348.6 },
    { tier: "flex", bookings: 9, revenue: 116.1 },
  ],
  top_locations: [
    {
      id: "loc-1",
      name: "Virapark",
      company_name: "Virapark",
      bookings: 12,
      revenue: 919.3,
      vehicle_days: 23,
    },
    {
      id: "loc-2",
      name: "Motion Park",
      company_name: "Motion Park",
      bookings: 33,
      revenue: 521.1,
      vehicle_days: 66,
    },
    {
      id: "loc-3",
      name: "Garageinn",
      company_name: "Garageinn",
      bookings: 0,
      revenue: 0,
      vehicle_days: 0,
    },
  ],
};

const FLOW = {
  date: "2026-07-29",
  entries: Array.from({ length: 24 }, (_, hour) => ({
    hour,
    vehicles: hour === 8 ? 9 : 0,
    passengers: hour === 8 ? 12 : 0,
    pcd: 0,
  })),
  exits: Array.from({ length: 24 }, (_, hour) => ({
    hour,
    vehicles: hour === 15 ? 3 : 0,
    passengers: 0,
    pcd: 0,
  })),
};

/** Filtro com uma unidade escolhida: a tela vira a visão da unidade. */
function comUmaUnidade(ui: React.ReactElement) {
  const range = resolvePeriod(DEFAULT_PERIOD);
  return (
    <ManagerFiltersContext.Provider
      value={{
        period: DEFAULT_PERIOD,
        setPeriod: () => {},
        range,
        compareRange: resolveCompare(DEFAULT_PERIOD, range),
        locationIds: ["loc-1"],
        setLocationIds: () => {},
        scopedLocationIds: ["loc-1"],
        reset: () => {},
      }}
    >
      {ui}
    </ManagerFiltersContext.Provider>
  );
}

function renderDashboard(
  wl?: unknown,
  route = "/manager",
  overview: ManagerOverview = OVERVIEW,
  opts: { unidade?: boolean } = {},
) {
  server.use(
    http.post(`${SUPABASE_URL}/rest/v1/rpc/wl_revenue`, () =>
      HttpResponse.json(
        wl ?? { total: { created: 0, paid: 0, paid_amount: 0 }, by_day: [], by_company: [] },
      ),
    ),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/manager_dashboard_overview`, () =>
      HttpResponse.json(overview),
    ),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/manager_daily_flow`, () => HttpResponse.json(FLOW)),
  );
  return renderWithProviders(
    opts.unidade ? comUmaUnidade(<ManagerDashboard />) : <ManagerDashboard />,
    {
      auth: mockAuth({ session: mockSession("hub_admin"), effectiveRole: "hub_admin" }),
      route,
    },
  );
}

describe("ManagerDashboard", () => {
  /**
   * A leitura é derivada, nunca escrita à mão: com 919,30 de 1440,40 a Virapark
   * passa de 60% e a frase de concentração é a que se sustenta.
   */
  it("monta a leitura da rede a partir dos números", async () => {
    renderDashboard();
    expect(
      await screen.findByText("Virapark sozinha faz 6 de cada 10 reais da rede"),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 de 30 unidades geraram receita/)).toBeInTheDocument();
  });

  it("separa o repasse ao parceiro da comissão retida", async () => {
    renderDashboard();
    expect(await screen.findByText("Receita da rede")).toBeInTheDocument();
    expect(screen.getByText("A repassar aos parceiros")).toBeInTheDocument();
    expect(screen.getByText("Comissão retida")).toBeInTheDocument();
  });

  /**
   * O ponto do ranking é a unidade PARADA aparecer. Antes ela sumia da lista,
   * porque o resumo só trazia quem vendeu.
   */
  it("mostra no ranking a unidade sem nenhuma reserva", async () => {
    renderDashboard();
    expect(await screen.findByText("Garageinn · sem reservas no período")).toBeInTheDocument();
    // O nome aparece no ranking e na lista de concentração; as duas são legítimas.
    expect(screen.getAllByText("Garageinn").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/28 unidades sem receita/)).toBeInTheDocument();
  });

  it("mostra a rede com receita e quantas ficaram paradas", async () => {
    renderDashboard();
    expect(await screen.findByText("Rede com receita")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("de 30 unidades")).toBeInTheDocument());
    expect(screen.getByText("28 unidades sem nenhuma reserva paga.")).toBeInTheDocument();
  });

  it("mostra a concentração e a faixa dominante de permanência", async () => {
    renderDashboard();
    expect(await screen.findByText("só a Virapark")).toBeInTheDocument();
    expect(screen.getByText("Concentração")).toBeInTheDocument();
    expect(screen.getByText("Faixa dominante")).toBeInTheDocument();
    // "2 a 3" aparece no rótulo da faixa dominante e na barra da distribuição.
    expect(screen.getAllByText("2 a 3")).toHaveLength(2);
  });

  it("separa clientes novos de recorrentes", async () => {
    renderDashboard();
    expect(await screen.findByText("já eram clientes")).toBeInTheDocument();
    expect(screen.getByText("Clientes")).toBeInTheDocument();
    expect(screen.getByText("Já tinham reservado")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
  });

  // 16/11/2026: na rede, fluxo por hora e reservas recentes saem (são da operação de um pátio), e
  // a quebra por destino só aparece com dois destinos ou mais.
  it("na rede: sem fluxo por hora nem reservas recentes; destino só com dois ou mais", async () => {
    renderDashboard();
    expect(await screen.findByText("Visão da rede")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Ranking do período")).toBeInTheDocument());
    expect(screen.queryByText("Fluxo de veículos por hora")).not.toBeInTheDocument();
    expect(screen.queryByText("Reservas recentes")).not.toBeInTheDocument();
    // O retrato tem um destino só: o card de destino daria 100% num aeroporto.
    expect(screen.queryByText("Por destino")).not.toBeInTheDocument();
  });

  it("na rede com dois destinos, a quebra por destino aparece", async () => {
    renderDashboard(undefined, "/manager", {
      ...OVERVIEW,
      by_destination: [
        { code: "VCP", name: "Viracopos", bookings: 12, revenue: 919.3, vehicle_days: 23 },
        { code: "GRU", name: "Guarulhos", bookings: 33, revenue: 521.1, vehicle_days: 66 },
      ],
    });
    expect(await screen.findByText("Por destino")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Viracopos")).toBeInTheDocument());
  });

  it("com uma unidade: cards de rede saem, entram fluxo, recentes e a leitura da unidade", async () => {
    const fluxo: unknown[] = [];
    renderDashboard(undefined, "/manager", OVERVIEW, { unidade: true });
    // Depois do render para ganhar do handler padrão (no MSW o último registrado vence).
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/rpc/manager_daily_flow`, async ({ request }) => {
        fluxo.push(((await request.json()) as Record<string, unknown>).p_source);
        return HttpResponse.json(FLOW);
      }),
    );
    expect(await screen.findByText("Visão da unidade")).toBeInTheDocument();
    expect(await screen.findByText("Fluxo de veículos por hora")).toBeInTheDocument();
    expect(screen.getByText("Reservas recentes")).toBeInTheDocument();
    expect(screen.getByText("Ticket médio")).toBeInTheDocument();
    for (const deRede of [
      "Rede com receita",
      "Concentração",
      "Ranking do período",
      "Por destino",
    ]) {
      expect(screen.queryByText(deRede)).not.toBeInTheDocument();
    }
    // 1440,40 contra 1200 no período anterior: +20%.
    expect(
      await screen.findByText("A receita subiu 20% sobre o período anterior"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/sozinha faz|de cada 10 reais/)).not.toBeInTheDocument();
    await waitFor(() => expect(fluxo).toContain("all"));
  });

  // Fase 5 (D6): receita da rede com a quebra por origem, e a comissão do site à parte.
  it("soma o site white-label na receita da rede, com a quebra e sem comissão do site", async () => {
    renderDashboard({
      total: { created: 8, paid: 6, paid_amount: 300 },
      by_day: [{ day: "2026-07-29", paid: 6, paid_amount: 300 }],
      by_company: [],
    });
    expect(await screen.findByTestId("receita-por-origem")).toHaveTextContent(
      "R$ 1.440,40 no Hub, R$ 300,00 no white-label",
    );
    expect(screen.getByTestId("receita-rede")).toHaveTextContent("R$ 1.740,40");
    // A venda do site não tem comissão no Hub (D4b revista em 09/10/2026).
    expect(screen.queryByText("Comissão do white-label")).not.toBeInTheDocument();
  });

  it("sem venda no site, nada de white-label na tela", async () => {
    renderDashboard();
    expect(await screen.findByText("Receita da rede")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("receita-rede")).toHaveTextContent("R$ 1.440,40"),
    );
    expect(screen.queryByTestId("receita-por-origem")).not.toBeInTheDocument();
    expect(screen.queryByText("Comissão do white-label")).not.toBeInTheDocument();
  });

  // Filtro de origem (13/10/2026), no endereço como na lista de Reservas.
  const SITE = {
    total: { created: 8, paid: 6, paid_amount: 300 },
    by_day: [{ day: "2026-07-29", paid: 6, paid_amount: 300 }],
    by_company: [
      { company_id: "c1", company_name: "Virapark", created: 8, paid: 6, paid_amount: 300 },
    ],
  };

  // Gráfico por dia do pagamento (09/11/2026): o recorte muda, o card de cima segue por check-in.
  it("por pagamento: o gráfico soma quem pagou no período e o card segue por check-in", async () => {
    const pedidos: string[] = [];
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/booking`, ({ request }) => {
        const url = new URL(request.url);
        pedidos.push(url.search);
        if (url.searchParams.get("select")?.includes("payment!inner")) {
          return HttpResponse.json([
            { total_amount: 200, payments: [{ paid_at: "2026-07-28T15:00:00Z" }] },
            { total_amount: 50, payments: [{ paid_at: "2026-07-29T15:00:00Z" }] },
          ]);
        }
        return HttpResponse.json([]);
      }),
    );
    renderDashboard(undefined, "/manager?origem=hub&data=pagamento");
    expect(await screen.findByText("Receita por dia do pagamento,")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("total-grafico-receita")).toHaveTextContent("R$ 250,00"),
    );
    // O card do período não muda de base.
    expect(screen.getByTestId("receita-rede")).toHaveTextContent("R$ 1.440,40");
    const pedidoPago = pedidos.find((s) => s.includes("payment"));
    expect(pedidoPago).toContain("payments.paid_at=gte.");
    expect(pedidoPago).toContain("payments.kind=eq.booking");
  });

  it("por pagamento com o white-label na tela: o site entra pela data da compra", async () => {
    const camposDeData: unknown[] = [];
    renderDashboard(undefined, "/manager?data=pagamento");
    // Registrado depois do render padrão para ganhar dele (o último handler vence no MSW).
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/rpc/wl_revenue`, async ({ request }) => {
        camposDeData.push(((await request.json()) as Record<string, unknown>).p_date_field);
        return HttpResponse.json({
          total: { created: 2, paid: 2, paid_amount: 90 },
          by_day: [{ day: "2026-07-29", paid: 2, paid_amount: 90 }],
          by_company: [],
        });
      }),
    );
    expect(await screen.findByText("No white-label, vale a data da compra.")).toBeInTheDocument();
    await waitFor(() => expect(camposDeData).toContain("created_at"));
  });

  it("por check-in (padrão), o título diz check-in", async () => {
    renderDashboard();
    expect(await screen.findByText("Receita por dia de check-in,")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Check-in" })).toHaveAttribute("aria-selected", "true");
  });

  it("origem Hub: receita só do Hub, sem quebra nem nada do site", async () => {
    renderDashboard(SITE, "/manager?origem=hub");
    expect(await screen.findByText("Receita do Hub")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("receita-rede")).toHaveTextContent("R$ 1.440,40"),
    );
    expect(screen.queryByTestId("receita-por-origem")).not.toBeInTheDocument();
    expect(screen.queryByTestId("site-por-estacionamento")).not.toBeInTheDocument();
  });

  // 16/11/2026: com a origem White-label, os cards analíticos leem o site (antes sumiam e a tela
  // de uma unidade só do site ficava vazia fora da receita). Repasse, comissão e tarifas são do Hub.
  it("origem White-label: os cards leem o site, e só o dinheiro e as tarifas do Hub saem", async () => {
    const origens: unknown[] = [];
    renderDashboard(SITE, "/manager?origem=wl");
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/rpc/manager_dashboard_overview`, async ({ request }) => {
        origens.push(((await request.json()) as Record<string, unknown>).p_source);
        return HttpResponse.json(OVERVIEW);
      }),
    );
    expect(await screen.findByText("Receita do white-label")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("receita-rede")).toHaveTextContent("R$ 300,00"));
    expect(
      await screen.findByText("Virapark sozinha faz 6 de cada 10 reais do white-label"),
    ).toBeInTheDocument();
    expect(screen.getByText("Rede com receita")).toBeInTheDocument();
    expect(screen.getByText("Concentração")).toBeInTheDocument();
    expect(screen.getByText("participação na receita do white-label")).toBeInTheDocument();
    expect(screen.getByText("Clientes")).toBeInTheDocument();
    expect(screen.queryByTestId("aviso-so-hub")).not.toBeInTheDocument();
    expect(screen.queryByTestId("site-por-estacionamento")).not.toBeInTheDocument();
    expect(screen.queryByText("A repassar aos parceiros")).not.toBeInTheDocument();
    expect(screen.queryByText("Receita de tarifas")).not.toBeInTheDocument();
    await waitFor(() => expect(origens).toContain("wl"));
  });

  it("a RPC dos cards recebe a origem escolhida (padrão: as duas)", async () => {
    const origens: unknown[] = [];
    renderDashboard();
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/rpc/manager_dashboard_overview`, async ({ request }) => {
        origens.push(((await request.json()) as Record<string, unknown>).p_source);
        return HttpResponse.json(OVERVIEW);
      }),
    );
    await waitFor(() => expect(origens).toContain("all"));
  });

  // A RPC soma o site em `current.revenue` quando a origem o inclui; o card de receita usa a quebra
  // por origem para não contar o site duas vezes.
  it("com Hub e site, o card de receita usa a parte do Hub e não soma o site duas vezes", async () => {
    renderDashboard(SITE, "/manager", {
      ...OVERVIEW,
      current: {
        ...OVERVIEW.current,
        revenue: 1740.4,
        bookings: 57,
        hub_revenue: 1440.4,
        hub_bookings: 51,
        hub_vehicle_days: 101,
        wl_revenue: 300,
        wl_bookings: 6,
      },
    });
    await waitFor(() =>
      expect(screen.getByTestId("receita-rede")).toHaveTextContent("R$ 1.740,40"),
    );
    expect(screen.getByTestId("receita-por-origem")).toHaveTextContent(
      "R$ 1.440,40 no Hub, R$ 300,00 no white-label",
    );
  });
});

describe("ManagerDashboard · receita longa", () => {
  // Regressão (16/11/2026): "R$ 1.698.146,34" no tamanho cheio era cortado no card.
  it("receita de 7 dígitos usa a fonte menor para caber no card", async () => {
    renderDashboard(undefined, "/manager", {
      ...OVERVIEW,
      current: { ...OVERVIEW.current, revenue: 1698146.34, hub_revenue: 1698146.34 },
    });
    await waitFor(() =>
      expect(screen.getByTestId("receita-rede")).toHaveTextContent("R$ 1.698.146,34"),
    );
    expect(screen.getByTestId("receita-rede").className).toContain("text-display-xl");
  });
});
