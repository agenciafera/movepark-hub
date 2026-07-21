import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { PayoutKycForm } from "./PayoutKycForm";
import { emptyPayoutKyc } from "./kyc";

describe("PayoutKycForm", () => {
  it("renderiza as seções do KYC PJ", () => {
    renderWithProviders(<PayoutKycForm defaultValues={emptyPayoutKyc()} onSubmit={vi.fn()} />);
    expect(screen.getByText("Dados da empresa")).toBeInTheDocument();
    expect(screen.getByText("Representante legal")).toBeInTheDocument();
    expect(screen.getByText("Conta bancária para repasse")).toBeInTheDocument();
  });

  it("bloqueia o submit e mostra erro quando o formulário está vazio/ inválido", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<PayoutKycForm defaultValues={emptyPayoutKyc()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    await waitFor(() => expect(screen.getByText("CNPJ inválido")).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("associa cada rótulo ao seu campo (leitor de tela anuncia o campo pelo nome)", () => {
    renderWithProviders(<PayoutKycForm defaultValues={emptyPayoutKyc()} onSubmit={vi.fn()} />);
    // getByLabelText só encontra o campo se houver vínculo programático (Label htmlFor -> id do
    // controle). Antes do fix nenhum destes achava o campo. Cobre input, select e combobox.
    for (const label of [
      "CNPJ",
      "Razão social",
      "E-mail da empresa",
      "Data de fundação",
      "Tipo de empresa",
      "Agência",
      "Conta",
      "Dígito da conta",
      "Banco",
    ]) {
      expect(screen.getByLabelText(label, { exact: true })).toBeInTheDocument();
    }
  });

  it("aponta a mensagem de erro pelo aria-describedby do campo inválido", async () => {
    renderWithProviders(<PayoutKycForm defaultValues={emptyPayoutKyc()} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    await waitFor(() => expect(screen.getByText("CNPJ inválido")).toBeInTheDocument());
    const cnpj = screen.getByLabelText("CNPJ", { exact: true });
    const describedBy = cnpj.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent("CNPJ inválido");
  });
});
