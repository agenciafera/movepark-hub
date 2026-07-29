import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import ManagerDashboard from "./ManagerDashboard";

const SUPABASE_URL = "http://localhost:54321";

const OVERVIEW = {
  current: {
    bookings: 603,
    revenue: 96828.18,
    ticket: 160.58,
    vehicle_days: 5356,
    revenue_per_vehicle_day: 18.08,
    avg_stay_days: 8.9,
    passengers: 812,
    pcd: 4,
    fare_revenue: 402,
  },
  previous: { bookings: 500, revenue: 80000, ticket: 160, vehicle_days: 4000 },
  statuses: { total: 700, cancelled: 40, no_show: 10, expired: 60, pending: 5 },
  customers: { new: 547, returning: 39 },
  by_destination: [
    { code: "GRU", name: "Guarulhos", bookings: 496, revenue: 79898.9, vehicle_days: 4649 },
    { code: "CGH", name: "Congonhas", bookings: 84, revenue: 14808.88, vehicle_days: 616 },
  ],
  length_of_stay: [
    { sort: 1, bookings: 184, revenue: 5000, vehicle_days: 184 },
    { sort: 4, bookings: 78, revenue: 20000, vehicle_days: 700 },
  ],
  by_fare: [
    { tier: "superflex", bookings: 12, revenue: 298.8 },
    { tier: "flex", bookings: 8, revenue: 103.2 },
  ],
  top_locations: [
    {
      id: "loc-1",
      name: "Aeropark GRU",
      company_name: "Aeropark",
      bookings: 300,
      revenue: 50000,
      vehicle_days: 2600,
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

function renderDashboard() {
  return renderWithProviders(<ManagerDashboard />, {
    auth: mockAuth({ session: mockSession("hub_admin"), effectiveRole: "hub_admin" }),
    route: "/manager",
  });
}

describe("ManagerDashboard", () => {
  it("mostra os indicadores de operação vindos da RPC de resumo", async () => {
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/rpc/manager_dashboard_overview`, () =>
        HttpResponse.json(OVERVIEW),
      ),
      http.post(`${SUPABASE_URL}/rest/v1/rpc/manager_daily_flow`, () => HttpResponse.json(FLOW)),
    );

    renderDashboard();

    // Diárias vendidas (vaga-dia) é o indicador de volume que o painel não tinha.
    expect(await screen.findByText("Diárias vendidas (Últimos 30 dias)")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("5.356")).toBeInTheDocument());

    // Quebra por destino: a média da rede escondia o aeroporto.
    expect(screen.getByText("Guarulhos")).toBeInTheDocument();
    expect(screen.getByText("Congonhas")).toBeInTheDocument();

    // Novos x recorrentes e o ranking de unidades.
    expect(screen.getByText("547")).toBeInTheDocument();
    expect(screen.getByText("Aeropark GRU")).toBeInTheDocument();
  });

  it("mostra o pico de chegada do fluxo horário do dia", async () => {
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/rpc/manager_dashboard_overview`, () =>
        HttpResponse.json(OVERVIEW),
      ),
      http.post(`${SUPABASE_URL}/rest/v1/rpc/manager_daily_flow`, () => HttpResponse.json(FLOW)),
    );

    renderDashboard();

    expect(await screen.findByText("Pico de chegada")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("08h")).toBeInTheDocument());
    expect(screen.getByText("9 carros nessa hora")).toBeInTheDocument();
  });

  /**
   * Regressão: "reservas hoje" era só `gte` no início do dia, então o card contava
   * todo o futuro e a comparação com ontem não queria dizer nada. A janela de hoje
   * tem que fechar dos dois lados.
   */
  it("conta o dia com janela fechada nos dois lados", async () => {
    const urls: string[] = [];
    server.use(
      http.all(`${SUPABASE_URL}/rest/v1/booking`, ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json([]);
      }),
      http.post(`${SUPABASE_URL}/rest/v1/rpc/manager_dashboard_overview`, () =>
        HttpResponse.json(OVERVIEW),
      ),
      http.post(`${SUPABASE_URL}/rest/v1/rpc/manager_daily_flow`, () => HttpResponse.json(FLOW)),
    );

    renderDashboard();

    await waitFor(() => expect(urls.length).toBeGreaterThan(0));
    await waitFor(() => {
      const bounded = urls.filter(
        (u) => u.includes("check_in_at=gte.") && u.includes("check_in_at=lt."),
      );
      // Hoje e ontem: as duas contagens são janelas fechadas.
      expect(bounded.length).toBeGreaterThanOrEqual(2);
    });
    // Nenhuma contagem de dia sai só com o piso da janela.
    const openEnded = urls.filter(
      (u) =>
        u.includes("select=id") && u.includes("check_in_at=gte.") && !u.includes("check_in_at=lt."),
    );
    expect(openEnded).toEqual([]);
  });
});
