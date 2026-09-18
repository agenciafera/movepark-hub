import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { mockAuth, renderWithProviders } from "@/test/utils";

const state = vi.hoisted(() => ({ booking: null as unknown, trail: null as unknown }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/bookings/api", () => ({
  useBookingByCode: () => ({ data: state.booking, isLoading: false }),
  useBookingGatewayTrail: () => ({ data: state.trail, isLoading: false, isError: false }),
  useCancelBookingStaff: () => ({ mutate: vi.fn(), isPending: false }),
}));

import ManagerBookingDetail from "./booking-detail";

function booking(status: string, payments: unknown[]) {
  return {
    id: "bk-1", code: "MP-7E2482", status, check_in_at: "2026-10-10T12:00:00Z", check_out_at: "2026-10-11T12:00:00Z",
    total_amount: 30.9, created_at: "2026-09-18T17:31:00Z", updated_at: "2026-09-18T17:37:00Z",
    customer_name: "kallef alexandre", customer_phone: "+5541988149449", customer_email: "k@ex.com", customer_tax_id: null,
    fare_tier: "flex", fare_cancel_until: "2026-10-09T12:00:00Z",
    price_breakdown: { days: 1, total: 30.9, line_items: [{ kind: "parking", quantity: 1, subtotal: 18 }, { kind: "fare", name: "Flex", tier: "flex", subtotal: 12.9 }] },
    location: { name: "Agência Fera", company: { id: "c1", name: "Agência Fera" } },
    profile: { full_name: "kallef", tax_id: null },
    vehicle: { license_plate: "BAI-2J44", model: "PEUGEOT/2008", color: "Branco" },
    payments,
  };
}
const pago = { id: "p1", status: "paid", refunded_at: null, created_at: "2026-09-18T17:36:40Z", paid_at: "2026-09-18T17:37:26Z", method: "card" };
const trailPago = {
  events: [],
  payments: [{
    id: "p1", kind: "booking", method: "card", status: "paid", amount: 30.9, installments: 1, created_at: "2026-09-18T17:36:40Z",
    split: [{ role: "partner", amount: 1440, chargeProcessingFee: true }, { role: "movepark", amount: 1650, liable: true }],
    split_sent_to_gateway: true, debt_recovered_cents: 0, gateway_fee_cents: 117, partner_release_at: "2026-10-20T03:00:00Z",
    refunded_amount: null, refund_absorbed_by_master: false, refund_partner_cents: 0,
  }],
};

function abre() {
  return renderWithProviders(
    <Routes>
      <Route path="/manager/bookings/:code" element={<ManagerBookingDetail />} />
    </Routes>,
    { route: "/manager/bookings/MP-7E2482", auth: mockAuth({ effectiveRole: "hub_admin", hasScope: () => true }) },
  );
}

describe("ManagerBookingDetail", () => {
  it("mostra os dois status e os valores destrinchados: cliente, estacionamento e Movepark", () => {
    state.booking = booking("confirmed", [pago]);
    state.trail = trailPago;
    abre();
    expect(screen.getByText("Reserva MP-7E2482")).toBeInTheDocument();
    expect(screen.getByText("Confirmada")).toBeInTheDocument();
    expect(screen.getByTestId("badge-pagamento")).toHaveTextContent("Pago");
    expect(screen.getByText("Estacionamento (diária)")).toBeInTheDocument();
    expect(screen.getByText("Plano Flex")).toBeInTheDocument();
    const norm = (s: string | null) => (s ?? "").replace(/\u00a0/g, " ");
    expect(norm(screen.getByTestId("valores-total").textContent)).toBe("R$ 30,90");
    expect(norm(screen.getByTestId("valores-parceiro").textContent)).toBe("R$ 13,23");
    expect(norm(screen.getByTestId("valores-movepark").textContent)).toBe("R$ 16,50");
    expect(screen.getByRole("button", { name: "Cancelar reserva" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voltar para Reservas/ })).toHaveAttribute("href", "/manager/bookings");
  });

  it("cancelada com estorno recusado avisa e aponta para a fila manual; não oferece cancelar de novo", () => {
    state.booking = booking("cancelled", [pago]);
    state.trail = trailPago;
    abre();
    expect(screen.getByTestId("badge-pagamento")).toHaveTextContent("Devolução pendente");
    expect(screen.getByTestId("aviso-devolucao-pendente")).toHaveTextContent("o cliente ainda não recebeu");
    expect(screen.queryByRole("button", { name: "Cancelar reserva" })).not.toBeInTheDocument();
  });

  it("reserva em uso ou concluída não oferece cancelamento (depois do check-in não estorna)", () => {
    state.trail = trailPago;
    state.booking = booking("checked_in", [pago]);
    const { unmount } = abre();
    expect(screen.queryByRole("button", { name: "Cancelar reserva" })).not.toBeInTheDocument();
    unmount();
    state.booking = booking("completed", [pago]);
    abre();
    expect(screen.queryByRole("button", { name: "Cancelar reserva" })).not.toBeInTheDocument();
  });

  it("avisa quando a janela de estorno do gateway já venceu (PIX pago há mais de 90 dias)", () => {
    state.booking = booking("confirmed", [{ ...pago, method: "pix", paid_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" }]);
    state.trail = null;
    abre();
    expect(screen.getByTestId("aviso-janela-estorno")).toHaveTextContent("fila de reembolso manual");
  });

  it("código que não existe mostra o vazio, com o caminho de volta", () => {
    state.booking = null;
    abre();
    expect(screen.getByText("Não achamos essa reserva")).toBeInTheDocument();
  });
});
