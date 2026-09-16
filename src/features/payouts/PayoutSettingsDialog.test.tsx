import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { PayoutRecipient } from "@/types/domain";

const mutateAsync = vi.fn().mockResolvedValue({ ok: true, warning: null });
const recipient = {
  id: "r1",
  company_id: "c1",
  transfer_interval: null, // herda o global → default Mensal/dia 1, automática DESLIGADA
  transfer_day: null,
  transfer_enabled: null,
  anticipation_enabled: null,
} as unknown as PayoutRecipient;

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
const setReleaseDays = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("./api", () => ({
  useUpdateRecipientPayout: () => ({ mutateAsync, isPending: false }),
  useRecipient: () => ({ data: recipient }),
  // E0.3.8: prazo de liberação por empresa.
  useSetCompanyPayoutReleaseDays: () => ({ mutateAsync: setReleaseDays, isPending: false }),
}));
vi.mock("@/features/companies/api", () => ({
  useCompanies: () => ({ data: [{ id: "c1", name: "Empresa", payout_release_days: null }] }),
}));

import { PayoutSettingsDialog } from "./PayoutSettingsDialog";

describe("PayoutSettingsDialog", () => {
  beforeEach(() => mutateAsync.mockClear());

  it("mostra o aviso de liberação da antecipação", () => {
    renderWithProviders(<PayoutSettingsDialog companyId="c1" open onOpenChange={() => {}} />);
    expect(screen.getByText(/Requer liberação prévia junto à Pagar.me/i)).toBeInTheDocument();
  });

  // Regressão: o fallback do switch era `?? true` enquanto o global já era "desligada". Abrir o
  // diálogo de uma empresa herdeira e salvar sem tocar em nada RELIGAVA a transferência automática.
  it("salva a cadência efetiva (herdado = Mensal/dia 1, automática desligada)", async () => {
    renderWithProviders(<PayoutSettingsDialog companyId="c1" open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      company_id: "c1",
      transfer: { enabled: false, interval: "Monthly", day: 1 },
    });
  });
});
