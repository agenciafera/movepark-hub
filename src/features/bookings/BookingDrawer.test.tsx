import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { BookingWithRelations } from "@/types/domain";

const updateMutate = vi.fn();

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./api", () => ({
  useUpdateBookingStatus: () => ({ mutate: updateMutate, isPending: false }),
  useCancelBookingStaff: () => ({ mutate: vi.fn(), isPending: false }),
  useRefundBookingStaff: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { BookingDrawer } from "./BookingDrawer";

function booking(status: string): BookingWithRelations {
  return {
    id: "bk-1",
    code: "MP-A1B2C3",
    status,
    check_in_at: "2026-10-10T12:00:00Z",
    check_out_at: "2026-10-12T12:00:00Z",
    total_amount: 100,
    location: { name: "GRU" },
    profile: { full_name: "Cliente", phone: null, tax_id: null },
    vehicle: { license_plate: "ABC1D23", model: null, color: null },
  } as never;
}

describe("BookingDrawer", () => {
  it("reserva confirmada oferece 'Não compareceu' (no-show) e dispara a transição", () => {
    renderWithProviders(<BookingDrawer booking={booking("confirmed")} open onOpenChange={vi.fn()} />);
    const btn = screen.getByRole("button", { name: /Não compareceu/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: "bk-1", status: "no_show" }),
      expect.anything(),
    );
  });

  it("reserva pendente NÃO oferece no-show (só confirmar/cancelar)", () => {
    renderWithProviders(<BookingDrawer booking={booking("pending")} open onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Não compareceu/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirmar/i })).toBeInTheDocument();
  });
});
