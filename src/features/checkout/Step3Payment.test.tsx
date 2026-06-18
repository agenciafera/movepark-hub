import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import type { InstallmentPolicy } from "@/lib/installments";

const cardMutate = vi.fn().mockResolvedValue({
  payment_id: "pc1",
  status: "paid",
  installments: 1,
  charged_amount: 100,
  interest_amount: 0,
  saved_card: false,
});

const policy: InstallmentPolicy = {
  version: 1,
  enabled: true,
  maxInstallments: 12,
  interestFreeUpTo: 3,
  monthlyInterestPct: 0,
  minInstallmentCents: 500,
  absorb: "customer",
};

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/payment-methods/api", () => ({ useMyPaymentMethods: () => ({ data: [] }) }));
vi.mock("@/lib/pagarme-tokenize", () => ({
  tokenizeCard: vi.fn().mockResolvedValue({ token: "token_1", brand: "visa", last4: "1111" }),
}));
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
    usePaymentConfig: () => ({
      data: { public_key: "pk_test_x", installment_policy: policy },
      isLoading: false,
    }),
    useCreateCardCharge: () => ({ mutateAsync: cardMutate, isPending: false }),
  };
});

import { Step3Payment } from "./Step3Payment";
import { tokenizeCard } from "@/lib/pagarme-tokenize";

describe("Step3Payment", () => {
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

  it("cartão novo: tokeniza e cobra com parcelas", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Step3Payment bookingCode="MP-ABC123" totalAmount={100} paymentStatus={null} onBack={() => {}} />,
    );
    await user.click(screen.getByRole("tab", { name: /Cartão/i }));
    await screen.findByLabelText("Número do cartão");

    fireEvent.change(screen.getByLabelText("Número do cartão"), { target: { value: "4111111111111111" } });
    fireEvent.change(screen.getByLabelText("Nome no cartão"), { target: { value: "Tony Stark" } });
    fireEvent.change(screen.getByLabelText("Validade (MM/AA)"), { target: { value: "12/30" } });
    fireEvent.change(screen.getByLabelText("CVV"), { target: { value: "123" } });
    expect(screen.getByLabelText("Parcelas")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Pagar com cartão/i }));

    await waitFor(() => expect(tokenizeCard).toHaveBeenCalled());
    await waitFor(() =>
      expect(cardMutate).toHaveBeenCalledWith(
        expect.objectContaining({ booking_code: "MP-ABC123", card_token: "token_1", installments: 1 }),
      ),
    );
  });
});
