import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
const savedCards = vi.hoisted(() => ({ data: [] as { id: string; brand: string; last4: string }[] }));
vi.mock("@/features/payment-methods/api", () => ({ useMyPaymentMethods: () => savedCards }));
vi.mock("@/features/profile/api", () => ({
  useProfile: () => ({ data: { tax_id: "04810388417" }, isLoading: false }),
  useUpdateProfile: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }),
}));
const acceptMutate = vi.hoisted(() => vi.fn());
vi.mock("@/features/legal/api", () => ({
  useAcceptTerms: () => ({ mutateAsync: acceptMutate, isPending: false }),
}));
vi.mock("@/features/legal/LegalDocumentModal", () => ({ LegalDocumentModal: () => null }));
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

import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { Step4Payment } from "./Step4Payment";
import { tokenizeCard } from "@/lib/pagarme-tokenize";
import { toast } from "sonner";

async function preencheCartao(validade: string) {
  fireEvent.change(screen.getByLabelText("Número do cartão"), {
    target: { value: "4111111111111111" },
  });
  fireEvent.change(screen.getByLabelText("Nome no cartão"), { target: { value: "Tony Stark" } });
  fireEvent.change(screen.getByLabelText("Validade (MM/AA)"), { target: { value: validade } });
  fireEvent.change(screen.getByLabelText("CVV"), { target: { value: "123" } });
  // Endereço de cobrança (antifraude): CEP e número, o resto vem do ViaCEP.
  server.use(
    http.get("https://viacep.com.br/ws/:cep/json/", () =>
      HttpResponse.json({ logradouro: "Rua XV de Novembro", bairro: "Centro", localidade: "Curitiba", uf: "PR" }),
    ),
  );
  fireEvent.change(screen.getByLabelText("CEP do endereço do cartão"), { target: { value: "80020310" } });
  fireEvent.change(screen.getByLabelText("Número"), { target: { value: "123" } });
  await screen.findByTestId("cep-endereco");
}

// Radix Select usa APIs de ponteiro/scroll ausentes no happy-dom.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

/** O `Intl` separa "R$" do valor com espaço duro; a comparação lê com espaço comum. */
const norm = (s: string | null) => (s ?? "").replace(/\u00a0/g, " ");

describe("Step4Payment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acceptMutate.mockResolvedValue({ ok: true, version: 1 });
  });

  // Link do agente (01/10/2026): quem pula o passo 1 aceita os Termos aqui, colado ao pagamento.
  it("sem aceite: mostra o clickwrap e grava o aceite antes de gerar o PIX", async () => {
    renderWithProviders(
      <Step4Payment
        bookingId="bk-1"
        bookingCode="MP-ABC123"
        totalAmount={100}
        customerTaxId="04810388417"
        termsAccepted={false}
        paymentStatus={null}
        onBack={() => {}}
      />,
    );
    expect(screen.getByText(/Ao pagar, você aceita os/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Gerar PIX/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Copiar código PIX/i })).toBeInTheDocument(),
    );
    expect(acceptMutate).toHaveBeenCalledWith({ booking_code: "MP-ABC123" });
  });

  it("se o aceite falha, não cobra", async () => {
    acceptMutate.mockRejectedValueOnce(new Error("Falha ao registrar o aceite"));
    renderWithProviders(
      <Step4Payment
        bookingId="bk-1"
        bookingCode="MP-ABC123"
        totalAmount={100}
        customerTaxId="04810388417"
        termsAccepted={false}
        paymentStatus={null}
        onBack={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Gerar PIX/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Falha ao registrar o aceite"));
    expect(screen.queryByRole("button", { name: /Copiar código PIX/i })).not.toBeInTheDocument();
  });

  it("com aceite já feito no passo 1, não repete o aviso nem o registro", async () => {
    renderWithProviders(
      <Step4Payment
        bookingId="bk-1"
        bookingCode="MP-ABC123"
        totalAmount={100}
        customerTaxId="04810388417"
        termsAccepted
        paymentStatus={null}
        onBack={() => {}}
      />,
    );
    expect(screen.queryByText(/Ao pagar, você aceita os/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Gerar PIX/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Copiar código PIX/i })).toBeInTheDocument(),
    );
    expect(acceptMutate).not.toHaveBeenCalled();
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
    // A bandeira aparece enquanto digita, e o número ganha espaço a cada 4 dígitos.
    expect(screen.getByLabelText("Número do cartão")).toHaveValue("4111 1111 1111 1111");
    expect(screen.getByRole("img", { name: "Visa" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nome no cartão"), { target: { value: "Tony Stark" } });
    fireEvent.change(screen.getByLabelText("Validade (MM/AA)"), { target: { value: "12/30" } });
    fireEvent.change(screen.getByLabelText("CVV"), { target: { value: "123" } });
    expect(screen.getByLabelText("Parcelas")).toBeInTheDocument();
    // Endereço de cobrança: CEP e número; o resto vem do ViaCEP.
    server.use(
      http.get("https://viacep.com.br/ws/:cep/json/", () =>
        HttpResponse.json({ logradouro: "Rua XV de Novembro", bairro: "Centro", localidade: "Curitiba", uf: "PR" }),
      ),
    );
    fireEvent.change(screen.getByLabelText("CEP do endereço do cartão"), { target: { value: "80020310" } });
    fireEvent.change(screen.getByLabelText("Número"), { target: { value: "123" } });
    expect(await screen.findByTestId("cep-endereco")).toHaveTextContent("Rua XV de Novembro, Centro · Curitiba/PR");

    fireEvent.click(screen.getByRole("button", { name: /Pagar com cartão/i }));

    await waitFor(() => expect(tokenizeCard).toHaveBeenCalled());
    await waitFor(() =>
      expect(cardMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          booking_code: "MP-ABC123",
          card_token: "token_1",
          installments: 1,
          billing_address: { zip_code: "80020310", line_1: "123, Rua XV de Novembro, Centro", city: "Curitiba", state: "PR", country: "BR" },
        }),
      ),
    );
  });

  it("cartão salvo já vem selecionado e paga sem redigitar nada", async () => {
    savedCards.data = [{ id: "pm_1", brand: "Visa", last4: "0466" }];
    try {
      const user = userEvent.setup();
      renderWithProviders(
        <Step4Payment bookingId="bk-1" bookingCode="MP-ABC123" totalAmount={100} customerTaxId="04810388417" paymentStatus={null} onBack={() => {}} />,
      );
      await user.click(screen.getByRole("tab", { name: /Cartão/i }));
      // Sem formulário de cartão novo: o salvo está escolhido.
      await waitFor(() => expect(screen.queryByLabelText("Número do cartão")).not.toBeInTheDocument());
      // 22/09/2026: a bandeira vem do vocabulário único, com a marca visual ao lado.
      expect(screen.getByRole("combobox", { name: "Cartão" })).toHaveTextContent("Visa •••• 0466");
      expect(screen.getByRole("img", { name: "Visa" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Pagar com cartão/i }));
      await waitFor(() =>
        expect(cardMutate).toHaveBeenCalledWith({ booking_code: "MP-ABC123", installments: 1, payment_method_id: "pm_1" }),
      );
      expect(tokenizeCard).not.toHaveBeenCalled();
    } finally {
      savedCards.data = [];
    }
  });

  it("sem CEP válido o cartão não vai ao gateway: o antifraude recusaria", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Step4Payment bookingId="bk-1" bookingCode="MP-ABC123" totalAmount={100} customerTaxId="04810388417" paymentStatus={null} onBack={() => {}} />,
    );
    await user.click(screen.getByRole("tab", { name: /Cartão/i }));
    await screen.findByLabelText("Número do cartão");
    fireEvent.change(screen.getByLabelText("Número do cartão"), { target: { value: "4111111111111111" } });
    fireEvent.change(screen.getByLabelText("Nome no cartão"), { target: { value: "Tony Stark" } });
    fireEvent.change(screen.getByLabelText("Validade (MM/AA)"), { target: { value: "12/30" } });
    fireEvent.change(screen.getByLabelText("CVV"), { target: { value: "123" } });
    server.use(http.get("https://viacep.com.br/ws/:cep/json/", () => HttpResponse.json({ erro: true })));
    fireEvent.change(screen.getByLabelText("CEP do endereço do cartão"), { target: { value: "99999999" } });
    fireEvent.change(screen.getByLabelText("Número"), { target: { value: "1" } });
    expect(await screen.findByTestId("cep-nao-encontrado")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Pagar com cartão/i }));
    await new Promise((r) => setTimeout(r, 50));
    expect(tokenizeCard).not.toHaveBeenCalled();
    expect(cardMutate).not.toHaveBeenCalled();
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

    await preencheCartao("01/20");
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

    await preencheCartao("1230");
    fireEvent.click(screen.getByRole("button", { name: /Pagar com cartão/i }));

    await waitFor(() =>
      expect(tokenizeCard).toHaveBeenCalledWith(
        "pk_test_x",
        expect.objectContaining({ exp_month: 12, exp_year: 2030 }),
      ),
    );
  });
});

/**
 * CDC art. 52: quem parcela com juros tem que ver a taxa, o acréscimo em reais e o CET
 * antes de pagar. A política vem do servidor (`get-payment-config`), e o número na tela é o
 * mesmo que a Edge `create-card-charge` cobra, porque os dois lados usam a mesma conta.
 */
describe("Step4Payment: parcelas com juros", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    policy.monthlyInterestPct = 2.99;
  });

  afterEach(() => {
    policy.monthlyInterestPct = 0;
  });

  async function abrirCartao() {
    renderWithProviders(
      <Step4Payment
        bookingId="bk-1"
        bookingCode="MP-ABC123"
        totalAmount={1000}
        customerTaxId="04810388417"
        paymentStatus={null}
        onBack={() => {}}
      />,
    );
    await user.click(screen.getByRole("tab", { name: /Cartão/i }));
    await screen.findByLabelText("Parcelas");
  }

  it("começa em 1x, com o resumo dizendo que não há juros", async () => {
    await abrirCartao();

    expect(norm(screen.getByTestId("parcelas-resumo").textContent)).toBe(
      "1x de R$ 1.000,00. Total R$ 1.000,00, sem juros.",
    );
  });

  it("cada opção com juros mostra taxa, acréscimo e CET; a escolhida vai para o resumo", async () => {
    await abrirCartao();

    await user.click(screen.getByLabelText("Parcelas"));
    const opcao12 = await screen.findByRole("option", { name: /12x de R\$/ });
    expect(norm(opcao12.textContent)).toContain(
      "juros de 2,99% a.m. Acréscimo de R$ 204,80. CET 2,99% a.m. (42,41% a.a.)",
    );
    const opcao3 = screen.getByRole("option", { name: /3x de R\$/ });
    expect(norm(opcao3.textContent)).toContain("sem juros");
    expect(norm(opcao3.textContent)).not.toContain("CET");

    await user.click(opcao12);

    expect(norm(screen.getByTestId("parcelas-resumo").textContent)).toBe(
      "12x de R$ 100,40. Total R$ 1.204,80, acréscimo de R$ 204,80. Juros 2,99% a.m., CET 2,99% a.m. (42,41% a.a.).",
    );
  });
});
