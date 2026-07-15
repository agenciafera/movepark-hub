import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { PayoutKycWizard } from "./PayoutKycWizard";
import { emptyPayoutKyc } from "./kyc";

describe("PayoutKycWizard", () => {
  it("começa no passo 1 (Sua empresa), sem botão Voltar", () => {
    renderWithProviders(<PayoutKycWizard defaultValues={emptyPayoutKyc()} onSubmit={vi.fn()} />);
    expect(screen.getByText(/Passo 1 de 3/i)).toBeInTheDocument();
    expect(screen.getByText(/Sua empresa/i)).toBeInTheDocument();
    expect(screen.getByText("Dados da empresa")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Voltar/i })).toBeNull();
  });

  it("não avança de etapa (nem submete) quando a etapa atual está inválida", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<PayoutKycWizard defaultValues={emptyPayoutKyc()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: /Continuar/i }));
    await waitFor(() => expect(screen.getByText("CNPJ inválido")).toBeInTheDocument());
    // segue no passo 1 (validação por etapa barra o avanço) e não chamou submit
    expect(screen.getByText(/Passo 1 de 3/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
