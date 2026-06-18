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
});
