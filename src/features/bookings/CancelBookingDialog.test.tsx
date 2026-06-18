import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { renderWithProviders } from "@/test/utils";
import { CancelBookingDialog } from "./CancelBookingDialog";
import { useCancelMyBooking } from "./customerApi";
import type { MyBookingDetail } from "./customerApi";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
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

  it("cancela usando o CODE da reserva e mostra o estorno em processamento", async () => {
    const mutateAsync = vi
      .fn()
      .mockResolvedValue({ status: "cancelled", refunded: true, refund_pending: true });
    vi.mocked(useCancelMyBooking).mockReturnValue({ mutateAsync, isPending: false } as never);

    renderWithProviders(
      <CancelBookingDialog booking={booking(inHours(48))} open onOpenChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Cancelar reserva/ }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith("MP-A8K7P2"));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("estorno")),
    );
  });
});
