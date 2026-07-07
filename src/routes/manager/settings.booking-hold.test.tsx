import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

// Mocka os hooks de app_setting (upsert genérico). O componente lê/clampa/salva as duas keys.
const mutateAsync = vi.fn().mockResolvedValue(undefined);
const appSettings: { data: Record<string, string> | undefined; isLoading: boolean } = {
  data: { booking_hold_minutes: "45", booking_hold_grace_minutes: "3" },
  isLoading: false,
};

vi.mock("@/features/settings/api", () => ({
  useAppSettings: () => appSettings,
  useUpdateAppSettings: () => ({ mutateAsync, isPending: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BookingHoldSettings } from "./settings";

describe("BookingHoldSettings", () => {
  beforeEach(() => {
    mutateAsync.mockClear();
    appSettings.data = { booking_hold_minutes: "45", booking_hold_grace_minutes: "3" };
  });

  it("renderiza os valores atuais do app_setting", () => {
    renderWithProviders(<BookingHoldSettings />);
    expect((screen.getByLabelText(/Hold da reserva/i) as HTMLInputElement).value).toBe("45");
    expect((screen.getByLabelText(/Folga do cancelamento/i) as HTMLInputElement).value).toBe("3");
  });

  it("salva as duas keys stringificadas", async () => {
    renderWithProviders(<BookingHoldSettings />);
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      booking_hold_minutes: "45",
      booking_hold_grace_minutes: "3",
    });
  });

  it("clampa no save (hold acima do máximo → 1440; grace acima → 60)", async () => {
    renderWithProviders(<BookingHoldSettings />);
    fireEvent.change(screen.getByLabelText(/Hold da reserva/i), { target: { value: "99999" } });
    fireEvent.change(screen.getByLabelText(/Folga do cancelamento/i), { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      booking_hold_minutes: "1440",
      booking_hold_grace_minutes: "60",
    });
  });

  it("clampa hold abaixo do mínimo (1 → 5)", async () => {
    renderWithProviders(<BookingHoldSettings />);
    fireEvent.change(screen.getByLabelText(/Hold da reserva/i), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ booking_hold_minutes: "5" }),
    );
  });
});
