import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { tabela } from "@/test/msw/supabase";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { toast } from "sonner";
import { PaymentMethodForm } from "./PaymentMethodForm";

/**
 * O formulário de cartão salvo. O ponto de atenção aqui é a validade: ela é a
 * única regra do formulário que depende de "hoje", e por isso a única que passa
 * batido numa revisão de olho.
 */

function abre(onOpenChange = vi.fn()) {
  renderWithProviders(<PaymentMethodForm open onOpenChange={onOpenChange} />, {
    auth: mockAuth({ session: mockSession("customer") }),
  });
  return onOpenChange;
}

function preenche(validade: string) {
  fireEvent.change(screen.getByLabelText(/Número do cartão/i), {
    target: { value: "5555444433332222" },
  });
  fireEvent.change(screen.getByLabelText(/Nome impresso/i), {
    target: { value: "QA TESTE" },
  });
  fireEvent.change(screen.getByLabelText(/Validade/i), { target: { value: validade } });
  fireEvent.change(screen.getByLabelText(/CVV/i), { target: { value: "123" } });
}

describe("PaymentMethodForm", () => {
  beforeEach(() => vi.mocked(toast.error).mockClear());

  // Regressão: a validação conferia só a faixa do mês (1 a 12) e que o ano não
  // era vazio, sem nunca comparar com a data corrente. Um cartão vencido em
  // 2020 era aceito e gravado como método de pagamento salvo, e a pessoa só
  // descobria na hora de pagar.
  it("recusa validade no passado e não chega a chamar o servidor", async () => {
    const insert = tabela("payment_method", "post", { json: [] });
    const onOpenChange = abre();

    preenche("01/20");
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Validade inválida"));
    expect(insert.chamadas).toHaveLength(0);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("aceita validade no futuro e fecha o diálogo", async () => {
    const insert = tabela("payment_method", "post", { json: [] });
    const onOpenChange = abre();

    preenche("12/40");
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() => expect(insert.chamadas).toHaveLength(1));
    expect(insert.ultimoBody).toMatchObject({ expiry_month: 12, expiry_year: 2040 });
    expect(toast.error).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
