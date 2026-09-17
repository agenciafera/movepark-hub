import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import type { BookingWithRelations } from "@/types/domain";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./api", () => ({
  useCancelBookingStaff: () => ({ mutate: vi.fn(), isPending: false }),
  // Rastro do gateway (E0.3.9) tem teste próprio em GatewayTrail.test.tsx.
  useBookingGatewayTrail: () => ({ data: null, isLoading: false, isError: false }),
}));

import { BookingModal } from "./BookingModal";

function booking(status: string): BookingWithRelations {
  return {
    id: "bk-1",
    code: "MP-A1B2C3",
    status,
    check_in_at: "2026-10-10T12:00:00Z",
    check_out_at: "2026-10-12T12:00:00Z",
    total_amount: 72.7,
    created_at: "2026-07-01T00:00:00Z",
    location: { name: "Virapark", company: { id: "c1", name: "Virapark" } },
    profile: { full_name: "kallef", phone: null },
    vehicle: { license_plate: "BAI-2J44", model: null, color: null },
    payments: [{ id: "p1", status: "paid", refunded_at: null, created_at: "2026-07-01T00:00:00Z", paid_at: "2026-07-01T00:00:00Z", method: "pix" }],
  } as never;
}

describe("BookingModal (Manager)", () => {
  it("mostra 'Cancelar reserva' numa reserva confirmada (antes do check-in)", () => {
    renderWithProviders(<BookingModal booking={booking("confirmed")} open onOpenChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Cancelar reserva" })).toBeInTheDocument();
  });

  it("NÃO mostra 'Cancelar reserva' numa reserva concluída (depois do check-in não estorna)", () => {
    renderWithProviders(<BookingModal booking={booking("completed")} open onOpenChange={() => {}} />);
    expect(screen.queryByRole("button", { name: "Cancelar reserva" })).toBeNull();
  });

  it("NÃO mostra em reserva em uso (checked_in)", () => {
    renderWithProviders(<BookingModal booking={booking("checked_in")} open onOpenChange={() => {}} />);
    expect(screen.queryByRole("button", { name: "Cancelar reserva" })).toBeNull();
  });

  it("avisa quando a janela de estorno do gateway já venceu (PIX pago há mais de 90 dias)", () => {
    // Reserva de longa antecedência: paga em julho, check-in em outubro, cancelamento em setembro.
    const b = booking("confirmed");
    b.payments = [{ id: "p1", status: "paid", refunded_at: null, created_at: "2026-05-01T12:00:00Z", paid_at: "2026-05-01T12:00:00Z", method: "pix" }] as never;
    renderWithProviders(<BookingModal booking={b} open onOpenChange={() => {}} />, {
      auth: mockAuth({ session: mockSession("hub_admin") }),
    });
    expect(screen.getByTestId("aviso-janela-estorno")).toHaveTextContent("venceu em 30/07/2026");
    expect(screen.getByTestId("aviso-janela-estorno")).toHaveTextContent("fila de reembolso manual");
  });

  it("sem aviso quando a janela está folgada", () => {
    const b = booking("confirmed");
    b.payments = [{ id: "p1", status: "paid", refunded_at: null, created_at: new Date().toISOString(), paid_at: new Date().toISOString(), method: "card" }] as never;
    renderWithProviders(<BookingModal booking={b} open onOpenChange={() => {}} />, {
      auth: mockAuth({ session: mockSession("hub_admin") }),
    });
    expect(screen.queryByTestId("aviso-janela-estorno")).not.toBeInTheDocument();
  });
});
