import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { rpc } from "@/test/msw/supabase";
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
