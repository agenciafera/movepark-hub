import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { PayoutRecipient } from "@/types/domain";

const mutateAsync = vi.fn().mockResolvedValue({ ok: true, warning: null });
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock("./api", () => ({
  useUpdateRecipientPayout: () => ({ mutateAsync, isPending: false }),
}));

import { PayoutSettingsDialog } from "./PayoutSettingsDialog";

const recipient = {
  id: "r1",
  company_id: "c1",
  transfer_interval: null, // herda o global → default Daily/0/true
  transfer_day: null,
  transfer_enabled: null,
  anticipation_enabled: null,
} as unknown as PayoutRecipient;

describe("PayoutSettingsDialog", () => {
  beforeEach(() => mutateAsync.mockClear());

  it("mostra o aviso de liberação da antecipação", () => {
    renderWithProviders(
      <PayoutSettingsDialog companyId="c1" recipient={recipient} open onOpenChange={() => {}} />,
    );
    expect(screen.getByText(/Requer liberação prévia junto à Pagar.me/i)).toBeInTheDocument();
  });

  it("salva a cadência efetiva (default Daily quando herdado)", async () => {
    renderWithProviders(
      <PayoutSettingsDialog companyId="c1" recipient={recipient} open onOpenChange={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      company_id: "c1",
      transfer: { enabled: true, interval: "Daily", day: 0 },
    });
  });
});
