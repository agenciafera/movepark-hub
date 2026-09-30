import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { PayoutKycWizard } from "./PayoutKycWizard";
import { emptyPayoutKyc, type PayoutKycForm } from "./kyc";

/** Empresa e representante válidos; o endereço da empresa sai sem complemento e o banco vazio. */
function semComplemento(): PayoutKycForm {
  const d = emptyPayoutKyc();
  const addr = {
    zip_code: "83010-620",
    street: "Rua Rocha Pombo",
    street_number: "2853",
    complement: "",
    neighborhood: "Águas Belas",
    city: "São José dos Pinhais",
    state: "PR",
    reference_point: "Perto do aeroporto",
  };
  d.company = {
    ...d.company,
    legal_name: "Estac LTDA",
    document: "11.222.333/0001-81",
    email: "contato@estac.com",
    annual_revenue: 1000000,
    founding_date: "10/10/2010",
    phone: "+5511999998888",
    address: addr,
  };
  d.representative = {
    ...d.representative,
    name: "Tony Stark",
    document: "390.533.447-05",
    email: "tony@estac.com",
    birthdate: "12/10/1985",
    monthly_income: 12000,
    professional_occupation: "Sócio",
    self_declared_legal_representative: true,
    phone: "+5511988887777",
    address: { ...addr, complement: "Galpão" },
  };
  return d;
}

const continuar = () => fireEvent.click(screen.getByRole("button", { name: /Continuar/i }));

describe("PayoutKycWizard", () => {
  it("começa na primeira seção (Empresa), sem botão Voltar", () => {
    renderWithProviders(<PayoutKycWizard defaultValues={emptyPayoutKyc()} onSubmit={vi.fn()} />);
    // a seção atual é nomeada na SubStepBar (sem "Passo 1 de N" competindo com a trilha macro)
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

  // Regressão (Nationpark, 30/09/2026): depois que o "Continuar" acusava o complemento vazio, a
  // mensagem seguia na tela enquanto o parceiro digitava (o form só revalidava ao sair do campo).
  it("tira o erro do complemento assim que o parceiro digita, sem precisar sair do campo", async () => {
    renderWithProviders(<PayoutKycWizard defaultValues={semComplemento()} onSubmit={vi.fn()} />);
    continuar();
    await screen.findByText("Endereço da empresa");
    continuar();
    await screen.findByText("Informe o complemento");

    fireEvent.change(screen.getByLabelText("Complemento"), { target: { value: "Galpão" } });

    await waitFor(() => expect(screen.queryByText("Informe o complemento")).toBeNull());
  });

  // Regressão: "Continuar" e "Salvar e continuar" eram o mesmo <button> no DOM. No navegador, o
  // React troca o type para "submit" antes de o clique terminar, o form é enviado e a etapa do
  // banco já abre toda em vermelho. O happy-dom não reproduz essa ordem, então o teste cobra a
  // causa: o botão de enviar precisa ser outro elemento, nunca o "Continuar" reaproveitado.
  it("o botão de enviar da última etapa não é o mesmo elemento do Continuar", async () => {
    const d = semComplemento();
    d.company.address.complement = "Galpão";
    renderWithProviders(<PayoutKycWizard defaultValues={d} onSubmit={vi.fn()} />);
    continuar();
    await screen.findByText("Endereço da empresa");
    continuar();
    await screen.findByText("Representante legal");
    const botaoContinuar = screen.getByRole("button", { name: /Continuar/i });
    fireEvent.click(botaoContinuar);
    await screen.findByText("Conta bancária para repasse");

    expect(screen.getByRole("button", { name: /Salvar e continuar/i })).not.toBe(botaoContinuar);
  });
});
