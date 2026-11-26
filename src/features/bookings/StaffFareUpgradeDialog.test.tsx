import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/qr", () => ({ toDataUrl: () => Promise.resolve("data:image/png;base64,qr") }));
const upgrade = vi.hoisted(() => vi.fn());
vi.mock("@/features/fares/api", () => ({
  useCreateFareUpgrade: () => ({ mutateAsync: upgrade, isPending: false }),
  useFareCatalog: () => ({
    data: [
      { tier: "basica", price_cents: 0 },
      { tier: "flex", price_cents: 1290 },
      { tier: "superflex", price_cents: 2490 },
    ],
    isLoading: false,
  }),
}));

import { StaffFareUpgradeDialog } from "./StaffFareUpgradeDialog";

const sp = (t: string | null) => (t ?? "").replace(/\u00a0/g, " ");

describe("StaffFareUpgradeDialog", () => {
  it("lista só os planos acima, gera o PIX do escolhido e avisa quando o plano muda", async () => {
    upgrade.mockResolvedValue({ payment_id: "u1", status: "pending", qr_code: "pixup", qr_code_url: "", expires_at: "2099-12-01T10:30:00Z", delta: 12 });
    const props = { bookingCode: "MP-1", open: true, onOpenChange: vi.fn(), onWaitingChange: vi.fn() };
    const r = render(<StaffFareUpgradeDialog currentTier="flex" {...props} />);
    expect(screen.queryByTestId("staff-upgrade-flex")).not.toBeInTheDocument();
    expect(sp(screen.getByTestId("staff-upgrade-superflex").textContent)).toContain("+ R$ 12,00");

    fireEvent.click(screen.getByRole("button", { name: "Gerar o PIX" }));
    expect(await screen.findByTestId("pix-cobranca")).toBeInTheDocument();
    expect(upgrade).toHaveBeenCalledWith({ booking_code: "MP-1", target_tier: "superflex" });
    expect(props.onWaitingChange).toHaveBeenLastCalledWith(true);

    r.rerender(<StaffFareUpgradeDialog currentTier="superflex" {...props} />);
    expect(await screen.findByTestId("pix-pago")).toHaveTextContent("A reserva agora é Superflex.");
    expect(props.onWaitingChange).toHaveBeenLastCalledWith(false);
  });
});
