import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { CancelBookingDialog } from "./CancelBookingDialog";
import { useCancelMyBooking } from "./customerApi";
import type { MyBookingDetail } from "./customerApi";

vi.mock("./customerApi", () => ({ useCancelMyBooking: vi.fn() }));
vi.mocked(useCancelMyBooking).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

function booking(checkInAt: string): MyBookingDetail {
  return {
    id: "bk-1",
    code: "MP-A8K7P2",
    status: "confirmed",
    check_in_at: checkInAt,
    total_amount: 159.5,
    parking_type: { name: "Vaga coberta", code: "covered" },
    location: { name: "Guarulhos", company: { name: "Aerovalet" } },
  } as never;
}

const inHours = (n: number) => new Date(Date.now() + n * 3600_000).toISOString();

describe("CancelBookingDialog", () => {
  it("dentro da janela (>24h) → reembolso integral", () => {
    renderWithProviders(
      <CancelBookingDialog booking={booking(inHours(48))} open onOpenChange={vi.fn()} />,
    );
    expect(screen.getByText(/Reembolso integral/)).toBeInTheDocument();
    expect(screen.getByText(/Cancele grátis até/)).toBeInTheDocument();
  });

  it("fora da janela (<24h) → sem reembolso", () => {
    renderWithProviders(
      <CancelBookingDialog booking={booking(inHours(2))} open onOpenChange={vi.fn()} />,
    );
    expect(screen.getByText(/sem reembolso/)).toBeInTheDocument();
  });
});
