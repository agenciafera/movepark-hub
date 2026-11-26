import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import type { BookingForCheckout } from "./api";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/qr", () => ({ toDataUrl: () => Promise.resolve("data:image/png;base64,qr") }));
vi.mock("@/features/bookings/customerApi", () => ({
  useBookingAccessCode: () => ({ data: { code: null, pending: false }, isLoading: false }),
  useVoucherPdf: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { Step5Confirmation } from "./Step5Confirmation";

const booking = {
  code: "MP-7K2X",
  check_in_at: "2026-12-01T21:00:00-03:00",
  check_out_at: "2026-12-05T21:00:00-03:00",
  location: { name: "Unidade Centro", address: "Rua A, 1", logo: null, company: { name: "Estacionamento X" } },
} as unknown as BookingForCheckout;

describe("Step5Confirmation (reunião de 26/11/2026: o QR de entrada parecia outro PIX)", () => {
  it("abre dizendo que o pagamento entrou, com o QR de entrada recolhido", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Step5Confirmation booking={booking} />);
    expect(await screen.findByRole("heading", { name: "Reserva confirmada!" })).toBeInTheDocument();
    expect(screen.getByTestId("confirmacao-pagamento")).toHaveTextContent("Não falta pagar nada");
    expect(screen.getByRole("link", { name: "Ver minha reserva" })).toHaveAttribute("href", "/bookings/MP-7K2X");
    expect(screen.queryByTestId("qr-entrada")).toBeNull();
    expect(screen.queryByRole("img", { name: /QR de entrada/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Mostrar o QR de entrada" }));
    expect(screen.getByTestId("qr-entrada")).toHaveTextContent("QR de entrada na portaria");
    expect(await screen.findByRole("img", { name: "QR de entrada da reserva MP-7K2X" })).toBeInTheDocument();
  });
});
