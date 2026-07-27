import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ListingTrustBar } from "./ListingTrustBar";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: vi.fn(),
}));

describe("ListingTrustBar", () => {
  it("mostra os 3 diferenciais e não é sticky (rola junto com o conteúdo)", () => {
    vi.mocked(usePrefersReducedMotion).mockReturnValue(false);
    const { container } = render(<ListingTrustBar />);
    // Cada diferencial aparece (desktop + marquee o duplicam), então basta ter ≥1.
    expect(screen.getAllByText("Vaga garantida").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cancelamento grátis").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Preço travado").length).toBeGreaterThan(0);
    expect(container.firstElementChild?.className).not.toContain("sticky");
  });

  it("com movimento normal, o mobile é um carrossel animado (marquee)", () => {
    vi.mocked(usePrefersReducedMotion).mockReturnValue(false);
    const { container } = render(<ListingTrustBar />);
    expect(container.querySelector(".mp-trust-track")).not.toBeNull();
  });

  it("sob prefers-reduced-motion o marquee some, vira linha estática com os 3 itens", () => {
    vi.mocked(usePrefersReducedMotion).mockReturnValue(true);
    const { container } = render(<ListingTrustBar />);
    expect(container.querySelector(".mp-trust-track")).toBeNull();
    expect(screen.getAllByText("Vaga garantida").length).toBeGreaterThan(0);
  });
});
