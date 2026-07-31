import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import ManagerDashboard from "./ManagerDashboard";

const SUPABASE_URL = "http://localhost:54321";

/** Retrato da rede real: duas unidades vendendo e o resto parado. */
const OVERVIEW = {
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

function renderDashboard() {
  server.use(
    http.post(`${SUPABASE_URL}/rest/v1/rpc/manager_dashboard_overview`, () =>
      HttpResponse.json(OVERVIEW),
    ),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/manager_daily_flow`, () => HttpResponse.json(FLOW)),
  );
  return renderWithProviders(<ManagerDashboard />, {
    auth: mockAuth({ session: mockSession("hub_admin"), effectiveRole: "hub_admin" }),
    route: "/manager",
  });
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

  it("mantém o fluxo horário e a quebra por destino", async () => {
    renderDashboard();
    expect(await screen.findByText("Fluxo de veículos por hora")).toBeInTheDocument();
    expect(screen.getByText("Por destino")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Viracopos")).toBeInTheDocument());
  });
});
