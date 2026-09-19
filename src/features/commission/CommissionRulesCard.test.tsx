import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { CommissionRule } from "@/types/domain";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const saveRule = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const deleteRule = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const rulesData = vi.hoisted(() => ({ current: [] as unknown[] }));
vi.mock("./api", () => ({
  useCommissionRules: () => ({ data: rulesData.current, isLoading: false, isError: false }),
  useSaveCommissionRule: () => ({ mutateAsync: saveRule, isPending: false }),
  useDeleteCommissionRule: () => ({ mutateAsync: deleteRule, isPending: false }),
}));
vi.mock("@/features/companies/api", () => ({
  useCompanies: () => ({ data: [{ id: "c1", name: "Abbapark", take_rate_bps: 2000 }] }),
}));

import { toast } from "sonner";
import { CommissionRulesCard } from "./CommissionRulesCard";

const REGRA: CommissionRule = {
  id: "r1",
  company_id: "c1",
  name: "Site do Abbapark",
  utm_sources: ["abbapark"],
  match_white_label: true,
  take_rate_bps: 500,
  gateway_fee_payer: "partner",
  chargeback_bearer: "partner",
  priority: 0,
  is_active: true,
  valid_from: null,
  valid_until: null,
  created_at: "2026-09-18T00:00:00Z",
  updated_at: "2026-09-18T00:00:00Z",
  created_by: null,
  deleted_at: null,
};

describe("CommissionRulesCard", () => {
  beforeEach(() => {
    rulesData.current = [];
    saveRule.mockClear();
    deleteRule.mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("sem regra, diz que toda venda usa a comissão padrão", () => {
    renderWithProviders(<CommissionRulesCard />);
    expect(screen.getByText("Nenhuma regra cadastrada")).toBeInTheDocument();
  });

  it("lista a regra com empresa, origem, comissão e quem paga o quê", () => {
    rulesData.current = [REGRA];
    renderWithProviders(<CommissionRulesCard />);
    const row = screen.getByText("Site do Abbapark").closest("tr")!;
    expect(within(row).getByText("Abbapark")).toBeInTheDocument();
    expect(within(row).getByText("abbapark")).toBeInTheDocument();
    expect(within(row).getByText("site white-label")).toBeInTheDocument();
    expect(within(row).getByText("5%")).toBeInTheDocument();
    expect(within(row).getByText("Estacionamento paga")).toBeInTheDocument();
    expect(within(row).getByText("Estacionamento arca com tudo")).toBeInTheDocument();
    expect(within(row).getByText("Ativa")).toBeInTheDocument();
  });

  it("nova regra: mostra o exemplo em reais, avisa quando a comissão não cobre a taxa e salva o payload", async () => {
    renderWithProviders(<CommissionRulesCard />);
    fireEvent.click(screen.getByRole("button", { name: "Nova regra" }));
    fireEvent.change(screen.getByLabelText("Nome da regra"), { target: { value: "Parceria" } });
    fireEvent.change(screen.getByLabelText("utm_source reconhecidos"), { target: { value: "Parceria, PARCERIA-insta" } });
    fireEvent.change(screen.getByLabelText("Comissão da Movepark (%)"), { target: { value: "5" } });

    expect(screen.getByText(/R\$\s?95,00 para o estacionamento/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/No cartão a taxa do gateway/);

    fireEvent.click(screen.getByRole("button", { name: "Salvar regra" }));
    await waitFor(() => expect(saveRule).toHaveBeenCalledTimes(1));
    expect(saveRule.mock.calls[0][0]).toMatchObject({
      name: "Parceria",
      company_id: null,
      utm_sources: ["parceria", "parceria-insta"],
      take_rate_bps: 500,
      gateway_fee_payer: "movepark",
      chargeback_bearer: "each",
    });
  });

  it("formulário inválido não chega ao banco", async () => {
    renderWithProviders(<CommissionRulesCard />);
    fireEvent.click(screen.getByRole("button", { name: "Nova regra" }));
    fireEvent.change(screen.getByLabelText("Nome da regra"), { target: { value: "Sem origem" } });
    fireEvent.change(screen.getByLabelText("Comissão da Movepark (%)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar regra" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(saveRule).not.toHaveBeenCalled();
  });

  it("remover pede confirmação e explica o que acontece com as reservas já criadas", async () => {
    rulesData.current = [REGRA];
    renderWithProviders(<CommissionRulesCard />);
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    expect(screen.getByText(/Reservas já criadas mantêm a comissão/)).toBeInTheDocument();
    expect(deleteRule).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remover" }));
    await waitFor(() => expect(deleteRule).toHaveBeenCalledWith("r1"));
  });
});
