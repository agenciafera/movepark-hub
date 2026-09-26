import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

const mutateAsync = vi.fn().mockResolvedValue(undefined);
const appSettings = { data: { payout_auto_enabled: "true", payout_auto_day: "10", payout_auto_min_cents: "5000" } as Record<string, string>, isLoading: false };
vi.mock("@/features/settings/api", () => ({ useAppSettings: () => appSettings, useUpdateAppSettings: () => ({ mutateAsync, isPending: false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PayoutAutoSettings } from "./settings";

describe("PayoutAutoSettings", () => {
  beforeEach(() => mutateAsync.mockClear());
  it("mostra dia e mínimo em reais e salva como texto, dia clampado a 1..31 e mínimo em centavos", async () => {
    renderWithProviders(<PayoutAutoSettings />);
    expect((screen.getByLabelText(/Dia do mês/i) as HTMLInputElement).value).toBe("10");
    expect((screen.getByLabelText(/Valor mínimo/i) as HTMLInputElement).value).toBe("50");
    fireEvent.change(screen.getByLabelText(/Dia do mês/i), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText(/Valor mínimo/i), { target: { value: "75,5" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ payout_auto_enabled: "true", payout_auto_day: "31", payout_auto_min_cents: "7550" }));
  });
  it("explica que o automático é sem taxa e o manual tem", () => {
    renderWithProviders(<PayoutAutoSettings />);
    expect(screen.getByText(/taxa da Pagar.me fica por conta da Movepark/)).toBeInTheDocument();
  });
});
