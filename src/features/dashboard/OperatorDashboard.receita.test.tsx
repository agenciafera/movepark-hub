import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { rpc } from "@/test/msw/supabase";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import OperatorDashboard from "./OperatorDashboard";

const SUPABASE_URL = "http://localhost:54321";

/**
 * Gráfico "Receita diária" do Operator (23/11/2026). Ele agrupava só pelo check-in, então a venda
 * de hoje para viajar na semana que vem caía num dia futuro, fora do período, e o gráfico de hoje
 * ficava parado o dia inteiro. Agora o padrão é o dia do pagamento (como no Manager), e o
 * check-in continua a um clique.
 */
const ESCOPOS_FINANCEIRO = ["finance:read", "payouts:read", "bookings:read", "occupancy:read"];
// Papel Operação (o balcão do estacionamento): reserva, check-in e ocupação, sem dinheiro.
const ESCOPOS_BALCAO = ["bookings:read", "bookings:write", "occupancy:read"];

function renderDashboard(
  route = "/operator",
  pedidos: string[] = [],
  escopos: string[] | null = null,
) {
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/booking`, ({ request }) => {
      const url = new URL(request.url);
      pedidos.push(url.search);
      if (url.searchParams.get("select")?.includes("payment!inner")) {
        return HttpResponse.json([
          // Duas vendas de hoje (Brasília) com check-in só na semana que vem.
          {
            total_amount: 120,
            price_breakdown: {
              line_items: [
                { kind: "parking", name: "Diárias", subtotal: 100 },
                { kind: "fare", name: "Plano", subtotal: 20 },
              ],
            },
            payments: [{ paid_at: "2026-11-23T15:00:00Z" }],
          },
          { total_amount: 150, payments: [{ paid_at: "2026-11-23T18:00:00Z" }] },
        ]);
      }
      return HttpResponse.json([]);
    }),
  );
  return renderWithProviders(<OperatorDashboard />, {
    auth: mockAuth({
      session: mockSession("company_operator"),
      effectiveCompanyIds: ["c1"],
      hasScope: escopos ? (e) => escopos.includes(e) : () => true,
    }),
    route,
  });
}

describe("OperatorDashboard: receita diária por dia do pagamento", () => {
  it("padrão: conta a venda no dia em que foi paga, só as diárias", async () => {
    const pedidos: string[] = [];
    renderDashboard("/operator", pedidos);
    expect(await screen.findByText("Receita por dia do pagamento,")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Pagamento" })).toHaveAttribute("aria-selected", "true");
    // 100 (diárias, sem o plano) + 150 (sem detalhe, vale o total).
    await waitFor(() =>
      expect(screen.getByTestId("total-grafico-receita")).toHaveTextContent("R$ 250,00"),
    );
    const pedidoPago = pedidos.find((s) => s.includes("payments.paid_at"));
    expect(pedidoPago).toContain("payments.paid_at=gte.");
    expect(pedidoPago).toContain("payments.kind=eq.booking");
  });

  it("?data=checkin: volta ao agrupamento pelo check-in e o título diz isso", async () => {
    renderDashboard("/operator?data=checkin");
    expect(await screen.findByText("Receita por dia de check-in,")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Check-in" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Receita por dia do pagamento,")).not.toBeInTheDocument();
  });
});

/**
 * Receita é financeiro (ADR-005): só quem tem `finance:read` (Dono, Gerente e Financeiro) vê o
 * gráfico, e o balcão (papel Operação) não vê nem a tela nem pede os valores que a alimentam.
 */
describe("OperatorDashboard: receita só para quem tem finance:read", () => {
  it("Financeiro vê o gráfico de receita", async () => {
    renderDashboard("/operator", [], ESCOPOS_FINANCEIRO);
    expect(await screen.findByText("Receita por dia do pagamento,")).toBeInTheDocument();
  });

  it("balcão (Operação): sem gráfico, sem seletor e sem tocar a tabela de reservas", async () => {
    const pedidos: string[] = [];
    // O servidor só libera `booking` a quem tem finance:read (23/11/2026): o balcão conta pela RPC,
    // que devolve datas, status e canal, nunca valor.
    const fatos = rpc("operator_booking_facts", { json: [] });
    const agenda = rpc("operator_day_agenda", { json: [] });
    renderDashboard("/operator", pedidos, ESCOPOS_BALCAO);
    expect(await screen.findByText("Reservas pagas")).toBeInTheDocument();
    await waitFor(() => expect(fatos.chamadas.length).toBeGreaterThan(0));
    await waitFor(() => expect(agenda.chamadas.length).toBeGreaterThan(0));
    expect(screen.queryByText(/Receita por dia/)).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Pagamento" })).not.toBeInTheDocument();
    // Nenhuma leitura direta da tabela: nem a receita, nem o split, nem o total das reservas.
    expect(pedidos).toEqual([]);
  });

  it("Financeiro continua lendo a tabela de reservas (o servidor libera com finance:read)", async () => {
    const pedidos: string[] = [];
    const fatos = rpc("operator_booking_facts", { json: [] });
    renderDashboard("/operator", pedidos, ESCOPOS_FINANCEIRO);
    expect(await screen.findByText("Reservas pagas")).toBeInTheDocument();
    await waitFor(() => expect(pedidos.length).toBeGreaterThan(0));
    expect(fatos.chamadas).toHaveLength(0);
  });
});
