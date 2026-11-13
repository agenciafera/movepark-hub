import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
const setReleaseDays = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const setSchedule = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const setAnticipation = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("./api", () => ({
  // E0.3.14: cartão em 30 dias (antecipação) e quem paga.
  useCompanyAnticipationEnabled: () => ({ data: false }),
  useSetCompanyAnticipation: () => ({ mutateAsync: setAnticipation, isPending: false }),
  // E0.3.8: prazo de liberação por empresa. É a única escrita do diálogo.
  useSetCompanyPayoutReleaseDays: () => ({ mutateAsync: setReleaseDays, isPending: false }),
  // E0.3.13: dia e liga/desliga do repasse automático da empresa.
  useSetCompanyPayoutSchedule: () => ({ mutateAsync: setSchedule, isPending: false }),
}));
vi.mock("@/features/companies/api", () => ({
  useCompanies: () => ({
    data: [{ id: "c1", name: "Empresa", payout_release_days: null, payout_auto_day: null, payout_auto_enabled: null, anticipation_fee_payer: null }],
  }),
}));
vi.mock("@/features/settings/api", () => ({ useAppSettings: () => ({ data: { card_anticipation_rate_monthly_bps: "311" } }) }));

import { PayoutSettingsDialog } from "./PayoutSettingsDialog";

describe("PayoutSettingsDialog", () => {
  beforeEach(() => {
    setReleaseDays.mockClear();
    setSchedule.mockClear();
    setAnticipation.mockClear();
  });

  // A cadência de transferência automática da Pagar.me continua fora do diálogo: quem saca no dia X
  // é o nosso cron (E0.3.13), e o recebedor nasce com transfer_enabled = false.
  it("não oferece transferência automática da Pagar.me", () => {
    renderWithProviders(<PayoutSettingsDialog companyId="c1" open onOpenChange={() => {}} />);
    expect(screen.getByText("Repasse")).toBeInTheDocument();
    expect(screen.queryByText(/Transferência automática/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recorrência/i)).not.toBeInTheDocument();
  });

  // E0.3.14: a antecipação nasce desligada e quem paga herda o padrão (Movepark).
  it("mostra o cartão em 30 dias desligado, o pagador herdado e o custo de referência", () => {
    renderWithProviders(<PayoutSettingsDialog companyId="c1" open onOpenChange={() => {}} />);
    expect(screen.getByText("Cartão em 30 dias")).toBeInTheDocument();
    expect(screen.getByLabelText(/Antecipação do cartão/i)).toHaveTextContent("Desligada");
    expect(screen.getByLabelText(/Quem paga a antecipação/i)).toHaveTextContent("Herda o padrão (Movepark)");
    expect(screen.getByText(/custa cerca de 3,11%/)).toBeInTheDocument();
  });

  it("sem mudança na antecipação, salvar não chama a Pagar.me", async () => {
    renderWithProviders(<PayoutSettingsDialog companyId="c1" open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(setReleaseDays).toHaveBeenCalled());
    expect(setAnticipation).not.toHaveBeenCalled();
  });

  it("salva o prazo de liberação da empresa e fecha", async () => {
    const onOpenChange = vi.fn();
    renderWithProviders(<PayoutSettingsDialog companyId="c1" open onOpenChange={onOpenChange} />);
    fireEvent.change(screen.getByLabelText(/Prazo de liberação do saque/i), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(setReleaseDays).toHaveBeenCalledWith({ company_id: "c1", days: 45 }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("campo vazio volta a herdar o global (days = null)", async () => {
    renderWithProviders(<PayoutSettingsDialog companyId="c1" open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(setReleaseDays).toHaveBeenCalledWith({ company_id: "c1", days: null }));
  });

  it("salva dia e liga/desliga do repasse automático da empresa", async () => {
    renderWithProviders(<PayoutSettingsDialog companyId="c1" open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Dia do repasse automático/i), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(setSchedule).toHaveBeenCalledWith({ company_id: "c1", day: 5, enabled: null }));
  });
});
