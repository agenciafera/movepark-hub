import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

const mutateAsync = vi.fn().mockResolvedValue(undefined);
const appSettings: { data: Record<string, string> | undefined; isLoading: boolean } = {
  data: { payout_release_days: "30" },
  isLoading: false,
};

vi.mock("@/features/settings/api", () => ({
  useAppSettings: () => appSettings,
  useUpdateAppSettings: () => ({ mutateAsync, isPending: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PayoutReleaseSettings } from "./settings";

describe("PayoutReleaseSettings", () => {
  beforeEach(() => mutateAsync.mockClear());

  it("mostra o prazo atual e salva como texto, clampado a 0..365", async () => {
    renderWithProviders(<PayoutReleaseSettings />);
    const input = screen.getByLabelText(/Prazo de liberação/i) as HTMLInputElement;
    expect(input.value).toBe("30");
    fireEvent.change(input, { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ payout_release_days: "365" }));
  });
});
