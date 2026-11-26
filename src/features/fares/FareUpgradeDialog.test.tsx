import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DEFAULT_CATALOG } from "@/features/listing/fareMatrix.logic";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/qr", () => ({ toDataUrl: () => Promise.resolve("data:image/png;base64,qr") }));
const upgrade = vi.hoisted(() => vi.fn());
vi.mock("./api", () => ({
  useCreateFareUpgrade: () => ({ mutateAsync: upgrade, isPending: false }),
  useFareCatalog: () => ({ data: DEFAULT_CATALOG, isLoading: false }),
}));
// O cartão tem teste próprio (ExtraChargeCardForm); aqui importa o que chega nele.
const cartao = vi.hoisted(() => vi.fn());
vi.mock("@/features/bookings/ExtraChargeCardForm", () => ({
  ExtraChargeCardForm: (p: unknown) => {
    cartao(p);
    return <p>formulário do cartão</p>;
  },
}));

import { FareUpgradeDialog } from "./FareUpgradeDialog";

/** Render com React Query que sobrevive ao `rerender` (a reserva relida chega como props novas). */
function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(ui, { wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> });
}

const sp = (t: string | null) => (t ?? "").replace(/\u00a0/g, " ");

describe("FareUpgradeDialog (reunião de 26/11/2026)", () => {
  beforeEach(() => {
    upgrade.mockReset();
    cartao.mockReset();
  });

  it("compara as tarifas numa tabela, com a diferença de cada uma e o que cada uma inclui", () => {
    renderWithProviders(
      <FareUpgradeDialog bookingCode="MP-1" currentTier="basica" currentFarePriceCents={0} open onOpenChange={vi.fn()} />,
    );
    const tabela = screen.getByTestId("fare-upgrade-table");
    expect(tabela).toHaveTextContent("Alteração de data/horário");
    expect(tabela).toHaveTextContent("Proteção de voo: atraso ou cancelamento");
    expect(sp(screen.getByTestId("fare-upgrade-option-flex").textContent)).toContain("+ R$ 12,90");
    expect(sp(screen.getByTestId("fare-upgrade-option-superflex").textContent)).toContain("+ R$ 24,90");
    // A sugestão é a mais popular do catálogo, e a tabela mostra por quê.
    expect(screen.getByTestId("fare-upgrade-option-flex")).toHaveAttribute("aria-pressed", "true");
  });

  it("PIX: espera o pagamento e diz que deu certo quando a reserva relida muda de tarifa", async () => {
    const user = userEvent.setup();
    upgrade.mockResolvedValue({ payment_id: "u1", status: "pending", qr_code: "pixup", qr_code_url: "", expires_at: "2099-12-01T10:30:00Z", delta: 12.9 });
    const onWaitingChange = vi.fn();
    const props = { bookingCode: "MP-1", currentFarePriceCents: 0, open: true, onOpenChange: vi.fn(), onWaitingChange };
    const r = renderWithProviders(<FareUpgradeDialog currentTier="basica" {...props} />);

    await user.click(screen.getByRole("button", { name: /Pagar R\$\s?12,90 no PIX/ }));
    expect(await screen.findByTestId("pix-cobranca")).toHaveTextContent("Leia o QR no app do seu banco");
    expect(upgrade).toHaveBeenCalledWith({ booking_code: "MP-1", target_tier: "flex" });
    expect(onWaitingChange).toHaveBeenLastCalledWith(true);
    // Na conta do cliente não existe o "Copiar com mensagem" da equipe.
    expect(screen.queryByRole("button", { name: "Copiar com mensagem" })).toBeNull();

    r.rerender(<FareUpgradeDialog currentTier="flex" {...props} />);
    expect(await screen.findByTestId("pix-pago")).toHaveTextContent("Pagamento recebido");
    expect(onWaitingChange).toHaveBeenLastCalledWith(false);
  });

  it("cartão só em reserva paga, e o upgrade vai à vista com a diferença vista na tabela", async () => {
    const user = userEvent.setup();
    const r = renderWithProviders(
      <FareUpgradeDialog bookingCode="MP-1" currentTier="basica" currentFarePriceCents={0} open onOpenChange={vi.fn()} />,
    );
    expect(screen.queryByRole("tab", { name: "Cartão" })).toBeNull();

    r.rerender(
      <FareUpgradeDialog bookingCode="MP-1" currentTier="basica" currentFarePriceCents={0} cardAllowed open onOpenChange={vi.fn()} />,
    );
    await user.click(screen.getByTestId("fare-upgrade-option-superflex"));
    await user.click(screen.getByRole("tab", { name: "Cartão" }));
    expect(await screen.findByText("formulário do cartão")).toBeInTheDocument();
    expect(cartao).toHaveBeenLastCalledWith(
      expect.objectContaining({ amountCents: 2490, charge: { kind: "fare_upgrade", targetTier: "superflex" } }),
    );
  });
});
