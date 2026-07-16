import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { PayoutKycWizard } from "./PayoutKycWizard";
import { emptyPayoutKyc } from "./kyc";

describe("PayoutKycWizard", () => {
  it("começa na primeira seção (Sua empresa), sem botão Voltar", () => {
    renderWithProviders(<PayoutKycWizard defaultValues={emptyPayoutKyc()} onSubmit={vi.fn()} />);
    // a seção atual é nomeada na SubStepBar (sem "Passo 1 de N" competindo com a trilha macro)
    expect(screen.getByText(/Sua empresa/i)).toBeInTheDocument();
    expect(screen.getByText("Dados da empresa")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Voltar/i })).toBeNull();
  });

  it("não avança de etapa (nem submete) quando a etapa atual está inválida", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<PayoutKycWizard defaultValues={emptyPayoutKyc()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: /Continuar/i }));
    await waitFor(() => expect(screen.getByText("CNPJ inválido")).toBeInTheDocument());
    // segue na primeira seção (validação por etapa barra o avanço) e não chamou submit
    expect(screen.getByText("Dados da empresa")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
