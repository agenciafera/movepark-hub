import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { InstallmentPolicy } from "@/lib/installments";

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
  useProfile: () => ({ data: { preferences: {} }, isLoading: false }),
  useUpdateProfile: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }),
}));
vi.mock("@/lib/pagarme-tokenize", () => ({
  tokenizeCard: vi.fn().mockResolvedValue({ token: "token_1", brand: "visa", last4: "1111" }),
}));
const cardMutate = vi.hoisted(() => vi.fn());
vi.mock("@/features/checkout/api", () => ({
  usePaymentConfig: () => ({ data: { public_key: "pk_test_x", installment_policy: policy }, isLoading: false }),
  useCreateCardCharge: () => ({ mutateAsync: cardMutate, isPending: false }),
}));

import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { ExtraChargeCardForm } from "./ExtraChargeCardForm";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

async function preencheCartao() {
  fireEvent.change(screen.getByLabelText("Número do cartão"), { target: { value: "4111111111111111" } });
  fireEvent.change(screen.getByLabelText("Nome no cartão"), { target: { value: "Tony Stark" } });
  fireEvent.change(screen.getByLabelText("Validade (MM/AA)"), { target: { value: "12/30" } });
  fireEvent.change(screen.getByLabelText("CVV"), { target: { value: "123" } });
  server.use(
    http.get("https://viacep.com.br/ws/:cep/json/", () =>
      HttpResponse.json({ logradouro: "Rua XV de Novembro", bairro: "Centro", localidade: "Curitiba", uf: "PR" }),
    ),
  );
  fireEvent.change(screen.getByLabelText("CEP do endereço do cartão"), { target: { value: "80020310" } });
  fireEvent.change(screen.getByLabelText("Número"), { target: { value: "123" } });
  await screen.findByTestId("cep-endereco");
}

describe("ExtraChargeCardForm (reunião de 26/11/2026: o mesmo cartão do checkout)", () => {
  beforeEach(() => {
    cardMutate.mockReset();
    cardMutate.mockResolvedValue({ payment_id: "c1", status: "paid", installments: 1, charged_amount: 24.9, interest_amount: 0, saved_card: true, applied: true });
  });

  it("upgrade: oferece salvar o cartão, não parcela e manda a tarifa com a diferença vista", async () => {
    const onPaid = vi.fn();
    renderWithProviders(
      <ExtraChargeCardForm
        bookingCode="MP-1"
        amountCents={2490}
        charge={{ kind: "fare_upgrade", targetTier: "superflex" }}
        onPaid={onPaid}
        onUsePix={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Parcelas")).toBeNull();
    expect(screen.getByText("À vista, sem parcelamento.")).toBeInTheDocument();
    await preencheCartao();
    fireEvent.click(screen.getByLabelText("Salvar este cartão para as próximas reservas"));
    fireEvent.click(screen.getByRole("button", { name: /Pagar R\$\s?24,90 no cartão/ }));

    await waitFor(() => expect(cardMutate).toHaveBeenCalledTimes(1));
    expect(cardMutate.mock.calls[0][0]).toMatchObject({
      booking_code: "MP-1",
      installments: 1,
      card_token: "token_1",
      save_card: true,
      fare_upgrade: { target_tier: "superflex", expected_delta_cents: 2490 },
    });
    expect(cardMutate.mock.calls[0][0].date_change).toBeUndefined();
    await waitFor(() => expect(onPaid).toHaveBeenCalledWith(true));
  });

  it("troca de datas: parcela conforme a reserva e também oferece salvar o cartão", async () => {
    renderWithProviders(
      <ExtraChargeCardForm
        bookingCode="MP-1"
        amountCents={3780}
        charge={{ kind: "date_change", checkInAt: "2026-12-01T21:00:00.000Z", checkOutAt: "2026-12-06T21:00:00.000Z" }}
        onPaid={vi.fn()}
        onUsePix={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Parcelas")).toBeInTheDocument();
    await preencheCartao();
    expect(screen.getByLabelText("Salvar este cartão para as próximas reservas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /no cartão/ }));
    await waitFor(() => expect(cardMutate).toHaveBeenCalledTimes(1));
    expect(cardMutate.mock.calls[0][0]).toMatchObject({
      date_change: { check_in_at: "2026-12-01T21:00:00.000Z", check_out_at: "2026-12-06T21:00:00.000Z", expected_delta_cents: 3780 },
      save_card: false,
    });
  });
});
