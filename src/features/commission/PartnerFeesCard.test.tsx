import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { PartnerFeeTable } from "./partnerFees.logic";

// Números inventados: o repo é público.
const state = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock("./api", () => ({
  usePartnerFeeTable: () => ({ data: state.data }),
}));

import { PartnerFeesCard } from "./PartnerFeesCard";

const TABELA: PartnerFeeTable = {
  pix_bps: 80,
  card: [
    { from: 1, to: 1, bps: 250 },
    { from: 2, to: 12, bps: 300 },
  ],
  cet30_bps: [250, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400],
  antifraud_cents: null,
  anticipation_rate_bps: 200,
  withdrawal_fee_cents: 150,
  policy: { version: 1, enabled: true, maxInstallments: 12, interestFreeUpTo: 3, monthlyInterestPct: 2, minInstallmentCents: 500, absorb: "customer" },
  channels: [
    { name: null, take_rate_bps: 2000, card_fee_payer: "movepark", anticipation_payer: "partner", installments_max: null, installments_interest_free: null },
    { name: "Site do parceiro", take_rate_bps: 1200, card_fee_payer: "partner", anticipation_payer: "partner", installments_max: null, installments_interest_free: null },
  ],
};

describe("PartnerFeesCard", () => {
  it("mostra quem paga cada taxa por canal", () => {
    state.data = TABELA;
    renderWithProviders(<PartnerFeesCard companyId="c1" />);
    const canais = screen.getByTestId("taxas-canais");
    const movepark = within(canais).getByText("Vendas pela Movepark").closest("tr")!;
    expect(movepark).toHaveTextContent(/20%\s*Movepark\s*Você/);
    const site = within(canais).getByText("Site do parceiro").closest("tr")!;
    expect(site).toHaveTextContent(/12%\s*Você\s*Você/);
  });

  it("mostra a tabela do cartão de 1x a 12x com a antecipação e o total em 30 dias", () => {
    state.data = TABELA;
    renderWithProviders(<PartnerFeesCard companyId="c1" />);
    const linhas = within(screen.getByTestId("taxas-cartao")).getAllByRole("row");
    expect(linhas).toHaveLength(13);
    expect(linhas[1]).toHaveTextContent(/1x\s*2,50%\s*0,00%\s*2,50%/);
    expect(linhas[3]).toHaveTextContent(/3x\s*3,00%\s*2,00%\s*5,00%/);
  });

  it("Pix, saque e parcelamento; sem antifraude quando nenhuma venda paga", () => {
    state.data = TABELA;
    renderWithProviders(<PartnerFeesCard companyId="c1" />);
    expect(screen.getByText(/Pix: 0,80%, o dinheiro entra na hora/)).toBeInTheDocument();
    expect(screen.getByText(/Saque para o banco: R\$\s?1,50 por saque que você pedir/)).toBeInTheDocument();
    expect(screen.queryByText(/Antifraude/)).toBeNull();
    expect(screen.getByText(/Sem juros até 3x; de 4x em diante o cliente paga juros de 2% ao mês/)).toBeInTheDocument();
  });

  it("antifraude aparece quando as vendas pagam", () => {
    state.data = { ...TABELA, antifraud_cents: 40 };
    renderWithProviders(<PartnerFeesCard companyId="c1" />);
    expect(screen.getByText(/Antifraude: R\$\s?0,40 por venda/)).toBeInTheDocument();
  });

  it("tabela não cadastrada: mostra os canais e avisa", () => {
    state.data = { ...TABELA, card: null };
    renderWithProviders(<PartnerFeesCard companyId="c1" />);
    expect(screen.getByTestId("taxas-canais")).toBeInTheDocument();
    expect(screen.queryByTestId("taxas-cartao")).toBeNull();
    expect(screen.getByText(/A tabela de taxas do cartão ainda não foi cadastrada/)).toBeInTheDocument();
  });

  it("sem dados (carregando ou sem permissão) não desenha nada", () => {
    state.data = undefined;
    const { container } = renderWithProviders(<PartnerFeesCard companyId="c1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
