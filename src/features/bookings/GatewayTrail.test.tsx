import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { edge, rpc } from "@/test/msw/supabase";
import { supabase } from "@/lib/supabase";
import { renderWithProviders } from "@/test/utils";
import { GatewayTrail } from "./GatewayTrail";

const trail = {
  payments: [
    {
      id: "p1", kind: "booking", method: "pix", status: "refunded", amount: 18, installments: null,
      provider_payment_id: "or_J2roadUDdI9nqkEe", provider_charge_id: "ch_1qXmZwT2rfaXyrKL",
      created_at: "2026-09-16T18:31:22Z", paid_at: "2026-09-16T18:31:51Z", expires_at: null,
      refunded_at: "2026-09-16T19:40:00Z", refunded_amount: 18, refund_reason: "cancelamento (staff)",
      refund_absorbed_by_master: false, refund_partner_cents: 1422, refund_partner_balance_cents: 12849, refund_split: null,
      split: [
        { role: "partner", recipientId: "re_p", amount: 1440, liable: false },
        { role: "movepark", recipientId: "re_mp", amount: 360, liable: true },
      ],
      split_sent_to_gateway: true, debt_recovered_cents: 0, gateway_fee_cents: 18, gateway_fee_synced_at: "2026-09-16T19:03:04Z",
      partner_release_at: "2026-09-16T03:00:00Z", pix_qr_code_url: null,
    },
  ],
  events: [
    { id: "e2", payment_id: "p1", kind: "refund", http_status: 200, request: { amount_cents: 1800 }, response: { id: "ch_1qXmZwT2rfaXyrKL", status: "refunded" }, note: "cancelamento (staff)", created_at: "2026-09-16T19:40:00Z" },
    { id: "e1", payment_id: "p1", kind: "webhook:charge.paid", http_status: null, request: null, response: { type: "charge.paid" }, note: null, created_at: "2026-09-16T18:31:51Z" },
  ],
};

describe("GatewayTrail", () => {
  it("mostra order, charge, split, estorno com quem pagou e os eventos com a resposta crua", async () => {
    rpc("booking_gateway_trail", { json: trail });
    renderWithProviders(<GatewayTrail bookingId="bk-1" />);
    expect(await screen.findByText(/or_J2roadUDdI9nqkEe/)).toBeInTheDocument();
    expect(screen.getByText(/ch_1qXmZwT2rfaXyrKL/)).toBeInTheDocument();
    expect(screen.getByTestId("trail-split")).toHaveTextContent("parceiro R$ 14,40");
    expect(screen.getByTestId("trail-split")).toHaveTextContent("Movepark R$ 3,60 (liable)");
    expect(screen.getByTestId("trail-refund")).toHaveTextContent("gateway debitou R$ 14,22 do parceiro");
    expect(screen.getByText("Webhook charge.paid")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Estorno"));
    expect(screen.getByText(/"status": "refunded"/)).toBeInTheDocument();
  });

  it("sem chamadas, diz isso em vez de esconder o bloco", async () => {
    rpc("booking_gateway_trail", { json: { payments: [], events: [] } });
    renderWithProviders(<GatewayTrail bookingId="bk-1" />);
    expect(await screen.findByText("Nenhuma chamada ao gateway nesta reserva.")).toBeInTheDocument();
  });
});

// Estorno avulso (19/10/2026): a cobrança em dobro da MP-07DAE9 precisava devolver a cópia com a
// reserva de pé, e só dava pelo painel da Pagar.me.
describe("GatewayTrail: estornar um pagamento sem cancelar a reserva", () => {
  const pago = (id: string, charge: string) => ({
    ...trail.payments[0],
    id,
    method: "card",
    installments: 3,
    status: "paid",
    amount: 219.7,
    provider_charge_id: charge,
    refunded_at: null,
    refunded_amount: null,
    refund_reason: null,
    refund_partner_cents: 0,
  });

  it("cobrança em dobro: estorna uma cópia com motivo e sem aviso de reserva sem pagamento", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: { access_token: "jwt" } as never },
      error: null,
    } as never);
    rpc("booking_gateway_trail", { json: { payments: [pago("p1", "ch_a"), pago("p2", "ch_b")], events: [] } });
    const chamada = edge("refund-payment", { json: { ok: true, status: "refunded", refund_pending: false } });
    renderWithProviders(<GatewayTrail bookingId="bk-1" />);

    const botoes = await screen.findAllByRole("button", { name: "Estornar" });
    expect(botoes).toHaveLength(2);
    await userEvent.click(botoes[1]);

    expect(screen.queryByTestId("refund-last-payment")).not.toBeInTheDocument();
    const confirmar = screen.getByRole("button", { name: /Estornar R\$\s219,70/ });
    expect(confirmar).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Motivo/), "cobrança em dobro");
    expect(confirmar).toBeEnabled();
    await userEvent.click(confirmar);

    await waitFor(() => expect(chamada.ultimoBody).toEqual({ payment_id: "p2", reason: "cobrança em dobro" }));
  });

  it("único pagamento da reserva: avisa que ela fica confirmada sem pagamento", async () => {
    rpc("booking_gateway_trail", { json: { payments: [pago("p1", "ch_a")], events: [] } });
    renderWithProviders(<GatewayTrail bookingId="bk-1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Estornar" }));
    expect(screen.getByTestId("refund-last-payment")).toBeInTheDocument();
  });

  it("pagamento já estornado não oferece estorno e mostra que a reserva ficou", async () => {
    rpc("booking_gateway_trail", {
      json: {
        payments: [{
          ...pago("p1", "ch_a"),
          status: "refunded",
          refunded_at: "2026-10-19T19:00:00Z",
          refunded_amount: 219.7,
          refund_reason: "estorno avulso (reserva mantida): cobrança em dobro",
          refund_keeps_booking: true,
          refund_requested_by_email: "developer@fera.ag",
        }],
        events: [],
      },
    });
    renderWithProviders(<GatewayTrail bookingId="bk-1" />);
    expect(await screen.findByTestId("trail-refund")).toHaveTextContent("reserva mantida · por developer@fera.ag");
    expect(screen.queryByRole("button", { name: "Estornar" })).not.toBeInTheDocument();
  });
});
