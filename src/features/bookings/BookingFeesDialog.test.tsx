import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { buildMoneyBreakdown, type MoneyPaymentLike } from "./bookingMoney.logic";

// Tudo inventado: o repo é público.
const state = vi.hoisted(() => ({ cardBps: 118, events: [] as unknown[] }));
vi.mock("./api", () => ({
  useBookingGatewayTrail: () => ({
    data: { payments: [], events: state.events },
    isLoading: false,
  }),
}));
vi.mock("@/features/settings/api", () => ({
  useAppSettings: () => ({
    isLoading: false,
    data: {
      gateway_fee_schedule: JSON.stringify({
        version: 1,
        pix_bps: 80,
        card: [
          { from: 1, to: 1, bps: state.cardBps },
          { from: 2, to: 6, bps: state.cardBps },
          { from: 7, to: 12, bps: state.cardBps },
        ],
        antifraud_cents: 5,
      }),
      card_installment_policy: JSON.stringify({
        version: 1,
        enabled: true,
        maxInstallments: 6,
        interestFreeUpTo: 2,
        monthlyInterestPct: 2,
        minInstallmentCents: 500,
        absorb: "customer",
      }),
      pagarme_movepark_recipient_id: "re_m",
    },
  }),
}));

import { BookingFeesDialog } from "./BookingFeesDialog";

const payables = (method: "card" | "pix") => ({
  payment_id: "p1",
  kind: "payables",
  created_at: "2026-11-02T10:00:00Z",
  response: {
    data:
      method === "card"
        ? [
            { type: "credit", recipient_id: "re_p", amount: 4000, fee: 0, installment: 1, payment_date: "2026-12-01T03:00:00Z" },
            { type: "credit", recipient_id: "re_m", amount: 1000, fee: 60, fraud_coverage_fee: 10, installment: 1, payment_date: "2026-12-01T03:00:00Z" },
            { type: "credit", recipient_id: "re_p", amount: 4000, fee: 0, anticipation_fee: 40, installment: 2, payment_date: "2026-11-05T03:00:00Z", original_payment_date: "2027-01-01T03:00:00Z" },
            { type: "credit", recipient_id: "re_m", amount: 1000, fee: 60, anticipation_fee: 5, installment: 2, payment_date: "2026-11-05T03:00:00Z", original_payment_date: "2027-01-01T03:00:00Z" },
          ]
        : [{ type: "credit", recipient_id: "re_m", amount: 2000, fee: 80 }],
  },
});

function abre(method: "card" | "pix") {
  state.events = [payables(method)];
  const fee = method === "card" ? 175 : 80;
  const pay: MoneyPaymentLike = {
    status: "paid",
    method,
    amount: 100,
    installments: method === "card" ? 2 : 1,
    split: [
      { role: "partner", amount: 8000, chargeProcessingFee: false },
      { role: "movepark", amount: 2000, liable: true },
    ],
    split_sent_to_gateway: true,
    debt_recovered_cents: 0,
    gateway_fee_cents: fee,
    partner_release_at: null,
    paid_at: "2026-11-01T12:00:00Z",
    refunded_amount: null,
    refund_absorbed_by_master: false,
    refund_partner_cents: 0,
    created_at: "2026-11-01T12:00:00Z",
  };
  const money = buildMoneyBreakdown(
    { days: 1, total: 100, line_items: [{ kind: "parking", quantity: 1, subtotal: 100 }] },
    100,
    pay,
  );
  return renderWithProviders(
    <BookingFeesDialog
      open
      onOpenChange={() => {}}
      bookingId="bk-1"
      money={money}
      payment={{
        id: "p1",
        method,
        amount: 100,
        installments: pay.installments,
        gateway_fee_cents: fee,
        anticipation_credit_cents: 40,
      }}
      booking={{
        total_amount: 100,
        commission_channel: "hub",
        commission_take_rate_bps: 2000,
        commission_anticipation_payer: "movepark",
      }}
    />,
  );
}

describe("BookingFeesDialog", () => {
  it("cartão: os quatro blocos, a taxa efetiva ao lado do contrato e o total do gateway", () => {
    state.cardBps = 118;
    abre("card");
    for (const t of ["Resumo", "Taxas cobradas nesta venda", "Parcelas", "Tabela de taxas"])
      expect(screen.getByText(t)).toBeInTheDocument();
    const mdr = screen.getByTestId("taxa-mdr");
    expect(mdr).toHaveTextContent("Cartão (Pagar.me)");
    expect(mdr).toHaveTextContent(/1,20% nesta venda · contrato 1,18%/);
    expect(mdr).not.toHaveTextContent("diferente do contrato");
    expect(screen.getByTestId("taxa-total")).toHaveTextContent(/1,75/);
    expect(screen.getByTestId("taxa-anticipation")).toHaveTextContent(/devolveu/);
    expect(within(screen.getByTestId("taxas-parcelas")).getAllByRole("row")).toHaveLength(3);
    expect(
      within(screen.getByTestId("tabela-parcelamento")).getByText(/2x de/).closest("[aria-current]"),
    ).not.toBeNull();
  });

  it("cartão fora do contrato ganha o aviso", () => {
    state.cardBps = 126;
    abre("card");
    expect(screen.getByTestId("taxa-mdr")).toHaveTextContent("diferente do contrato");
  });

  it("Pix: sem bloco de parcelas e sem antecipação", () => {
    state.cardBps = 118;
    abre("pix");
    expect(screen.queryByText("Parcelas")).toBeNull();
    expect(screen.queryByTestId("taxa-anticipation")).toBeNull();
    expect(screen.getByTestId("taxa-mdr")).toHaveTextContent(/Pix \(Pagar.me\)/);
    expect(screen.getByTestId("taxa-mdr")).toHaveTextContent(/0,80% nesta venda · contrato 0,80%/);
  });
});
