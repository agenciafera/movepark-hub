import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { mockAuth, renderWithProviders } from "@/test/utils";
import OperatorReports from "./reports";

const SUPABASE_URL = "http://localhost:54321";

/**
 * Relatórios > Receita do Operator (23/11/2026). Mesma base do dashboard: por padrão a reserva conta
 * no dia em que foi paga; `?data=checkin` volta ao agrupamento pelo dia em que o carro entra.
 */
const pago = {
  status: "paid",
  method: "pix",
  amount: 136.5,
  installments: 1,
  created_at: "2026-11-23T13:10:00Z",
  paid_at: "2026-11-23T13:10:00Z",
  split: [
    { role: "partner", amount: 8928 },
    { role: "movepark", amount: 4722 },
  ],
  split_sent_to_gateway: true,
  debt_recovered_cents: 0,
  gateway_fee_cents: 0,
  partner_release_at: null,
  refunded_amount: null,
  refund_absorbed_by_master: false,
  refund_partner_cents: 0,
};
const pb = {
  days: 4,
  line_items: [
    { kind: "parking", subtotal: 111.6 },
    { kind: "fare", tier: "superflex", subtotal: 24.9 },
  ],
};

function renderReports(route = "/operator/reports", pedidos: string[] = []) {
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/booking`, ({ request }) => {
      const url = new URL(request.url);
      pedidos.push(url.search);
      // Por pagamento: duas reservas pagas hoje, com check-in só no mês que vem.
      if (url.searchParams.has("payments.paid_at")) {
        const linha = { total_amount: 136.5, price_breakdown: pb, payments: [pago] };
        return HttpResponse.json([linha, linha]);
      }
      // Por check-in: uma reserva, 50 reais, sem pagamento embutido.
      if (url.searchParams.has("check_in_at")) {
        return HttpResponse.json([
          { check_in_at: "2026-11-20T10:00:00Z", total_amount: 50, price_breakdown: null, payments: [] },
        ]);
      }
      return HttpResponse.json([]);
    }),
  );
  return renderWithProviders(<OperatorReports />, {
    auth: mockAuth({ effectiveCompanyIds: ["c1"], hasScope: () => true }),
    route,
  });
}

describe("OperatorReports: receita por dia do pagamento", () => {
  it("padrão: conta no dia do pagamento, com diárias, líquido e reservas", async () => {
    const pedidos: string[] = [];
    renderReports("/operator/reports", pedidos);
    expect(await screen.findByText("Diárias por dia do pagamento")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Pagamento" })).toHaveAttribute("aria-selected", "true");
    // 2 reservas x 111,60 de diárias (o plano da Movepark fica de fora) e 89,28 de líquido cada.
    await waitFor(() => expect(screen.getByTestId("relatorio-diarias")).toHaveTextContent("R$ 223,20"));
    expect(screen.getByTestId("relatorio-liquido")).toHaveTextContent("R$ 178,56");
    const pedidoPago = pedidos.find((s) => s.includes("payments.paid_at"));
    expect(pedidoPago).toContain("payments.kind=eq.booking");
  });

  it("?data=checkin: volta ao agrupamento pelo check-in", async () => {
    renderReports("/operator/reports?data=checkin");
    expect(await screen.findByText("Diárias por dia de check-in")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Check-in" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(screen.getByTestId("relatorio-diarias")).toHaveTextContent("R$ 50,00"));
  });
});
