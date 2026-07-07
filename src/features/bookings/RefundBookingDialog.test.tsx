import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { RefundBookingDialog } from "./RefundBookingDialog";

const mutateAsync = vi.fn().mockResolvedValue({ refunded: true, refund_pending: false });

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./api", () => ({
  useRefundBookingStaff: () => ({ mutateAsync, isPending: false }),
}));

describe("RefundBookingDialog", () => {
  it("confirma o estorno chamando a mutation com code + motivo, e deixa claro que não cancela", () => {
    renderWithProviders(
      <RefundBookingDialog bookingCode="MP-X1" totalAmount={100} open onOpenChange={vi.fn()} />,
    );
    expect(screen.getByText(/Não cancela a reserva/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Motivo/i), { target: { value: "duplicado" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirmar estorno/i }));

    expect(mutateAsync).toHaveBeenCalledWith({ bookingCode: "MP-X1", reason: "duplicado" });
  });

  it("não renderiza sem bookingCode", () => {
    const { container } = renderWithProviders(
      <RefundBookingDialog bookingCode={null} open onOpenChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
