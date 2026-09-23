import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const resolveClaim = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const claims = vi.hoisted(() => ({ current: [] as unknown[] }));
vi.mock("./api", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    useGuaranteeClaims: () => ({ data: claims.current, isLoading: false }),
    useResolveGuaranteeClaim: () => ({ mutateAsync: resolveClaim, isPending: false }),
  };
});

import { GuaranteeClaimsCard } from "./GuaranteeClaimsCard";

const ABERTO = {
  id: "g1", booking_id: "b1", opened_at: "2026-09-23T12:00:00Z", channel: "app", status: "open", covered_cents: 0, note: null, resolved_at: null,
  booking: { code: "MP-ABC123", customer_name: "Ana", customer_phone: "+5541999990000", check_in_at: "2026-09-23T11:00:00Z", location: { name: "Confins", company: { name: "BePark" } } },
};

describe("GuaranteeClaimsCard", () => {
  beforeEach(() => {
    claims.current = [];
    resolveClaim.mockClear();
  });

  it("sem acionamento aberto, o card não existe", () => {
    const { container } = renderWithProviders(<GuaranteeClaimsCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lista o acionamento e fecha com desfecho, valor e nota", async () => {
    claims.current = [ABERTO];
    renderWithProviders(<GuaranteeClaimsCard />);
    expect(screen.getByText("Garantia de vaga acionada")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "MP-ABC123" })).toHaveAttribute("href", "/manager/bookings/MP-ABC123");
    expect(screen.getByText("BePark · Confins")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Valor coberto pela Movepark (R$)"), { target: { value: "15,50" } });
    fireEvent.change(within(dialog).getByLabelText("O que aconteceu"), { target: { value: "vizinho" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar acionamento" }));
    await waitFor(() => expect(resolveClaim).toHaveBeenCalledWith({ id: "g1", status: "relocated", coveredCents: 1550, note: "vizinho" }));
  });
});
