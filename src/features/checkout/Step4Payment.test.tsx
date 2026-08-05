import { beforeEach, describe, expect, it, vi } from "vitest";
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
vi.mock("@/features/profile/api", () => ({
  useProfile: () => ({ data: { tax_id: "04810388417" }, isLoading: false }),
  useUpdateProfile: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }),
}));
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
    useUpdateBookingCustomer: () => ({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    }),
  };
});

import { Step4Payment } from "./Step4Payment";
import { tokenizeCard } from "@/lib/pagarme-tokenize";
import { toast } from "sonner";

function preencheCartao(validade: string) {
  fireEvent.change(screen.getByLabelText("Número do cartão"), {
    target: { value: "4111111111111111" },
  });
  fireEvent.change(screen.getByLabelText("Nome no cartão"), { target: { value: "Tony Stark" } });
  fireEvent.change(screen.getByLabelText("Validade (MM/AA)"), { target: { value: validade } });
  fireEvent.change(screen.getByLabelText("CVV"), { target: { value: "123" } });
}

describe("Step4Payment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gera o PIX e mostra o QR + aguardo de confirmação", async () => {
    renderWithProviders(
      <Step4Payment
        bookingId="bk-1"
        bookingCode="MP-ABC123"
        totalAmount={100}
        customerTaxId="04810388417"
        paymentStatus={null}
        onBack={() => {}}
      />,
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
      <Step4Payment
        bookingId="bk-1"
        bookingCode="MP-ABC123"
        totalAmount={100}
        customerTaxId="04810388417"
        paymentStatus={null}
        onBack={() => {}}
      />,
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

  // Regressão: a validade era conferida só na faixa do mês, sem comparar com
  // hoje. Um cartão vencido seguia para a tokenização no Pagar.me, e a recusa
  // só voltava do gateway, como erro genérico de pagamento.
  it("cartão vencido não chega na tokenização", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Step4Payment
        bookingId="bk-1"
        bookingCode="MP-ABC123"
        totalAmount={100}
        customerTaxId="04810388417"
        paymentStatus={null}
        onBack={() => {}}
      />,
    );
    await user.click(screen.getByRole("tab", { name: /Cartão/i }));
    await screen.findByLabelText("Número do cartão");

    preencheCartao("01/20");
    fireEvent.click(screen.getByRole("button", { name: /Pagar com cartão/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Validade inválida (use MM/AA)."));
    expect(tokenizeCard).not.toHaveBeenCalled();
    expect(cardMutate).not.toHaveBeenCalled();
  });

  // O campo do checkout não tem máscara: quem digita "1230" sem a barra tem um
  // cartão bom, e recusar isso seria trocar um bug por outro.
  it("aceita a validade digitada sem barra", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Step4Payment
        bookingId="bk-1"
        bookingCode="MP-ABC123"
        totalAmount={100}
        customerTaxId="04810388417"
        paymentStatus={null}
        onBack={() => {}}
      />,
    );
    await user.click(screen.getByRole("tab", { name: /Cartão/i }));
    await screen.findByLabelText("Número do cartão");

    preencheCartao("1230");
    fireEvent.click(screen.getByRole("button", { name: /Pagar com cartão/i }));

    await waitFor(() =>
      expect(tokenizeCard).toHaveBeenCalledWith(
        "pk_test_x",
        expect.objectContaining({ exp_month: 12, exp_year: 2030 }),
      ),
    );
  });
});
