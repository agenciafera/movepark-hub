import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

// Mocka só o hook de cobrança PIX (evita rede/sessão); mantém o resto da api real.
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    useCreatePixCharge: () => ({
      mutateAsync: vi.fn().mockResolvedValue({
        payment_id: "p1",
        status: "pending",
        qr_code: "00020126ABCDEF5204000053039865802BR6304TEST",
        qr_code_url: null,
        expires_at: null,
      }),
      isPending: false,
    }),
    useMockPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

import { Step3Payment } from "./Step3Payment";

describe("Step3Payment — PIX real", () => {
  it("gera o PIX e mostra o QR + aguardo de confirmação", async () => {
    renderWithProviders(
      <Step3Payment bookingCode="MP-ABC123" totalAmount={100} paymentStatus={null} onBack={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Gerar PIX/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Copiar código PIX/i })).toBeInTheDocument(),
    );
    expect(screen.getByText(/Aguardando confirmação automática/i)).toBeInTheDocument();
  });
});
