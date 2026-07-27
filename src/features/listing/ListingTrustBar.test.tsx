import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ListingTrustBar } from "./ListingTrustBar";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: vi.fn(),
}));

// happy-dom não implementa Element.scrollTo; instala um espião e restaura depois.
const origScrollTo = Element.prototype.scrollTo;
afterEach(() => {
  Element.prototype.scrollTo = origScrollTo;
  vi.useRealTimers();
});

describe("ListingTrustBar", () => {
  it("mostra os 3 diferenciais e não é sticky (rola junto com o conteúdo)", () => {
    vi.mocked(usePrefersReducedMotion).mockReturnValue(false);
    const { container } = render(<ListingTrustBar />);
    // Cada diferencial aparece (carrossel do mobile + linha do desktop), então ≥1.
    expect(screen.getAllByText("Vaga garantida").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cancelamento grátis").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Preço travado").length).toBeGreaterThan(0);
    expect(container.firstElementChild?.className).not.toContain("sticky");
  });

  it("é um carrossel com um indicador (dot) por diferencial, navegável ao toque", () => {
    vi.mocked(usePrefersReducedMotion).mockReturnValue(false);
    render(<ListingTrustBar />);
    const dots = screen.getAllByRole("button", { name: /^Ir para:/ });
    expect(dots).toHaveLength(3);
  });

  it("auto-avança sozinho (uma passagem por vez) quando há movimento", () => {
    vi.useFakeTimers();
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo as never;
    vi.mocked(usePrefersReducedMotion).mockReturnValue(false);
    render(<ListingTrustBar />);
    expect(scrollTo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3600);
    expect(scrollTo).toHaveBeenCalledTimes(1); // avançou UM slide
  });

  it("sob prefers-reduced-motion não auto-avança (só o swipe do usuário)", () => {
    vi.useFakeTimers();
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo as never;
    vi.mocked(usePrefersReducedMotion).mockReturnValue(true);
    render(<ListingTrustBar />);
    vi.advanceTimersByTime(10000);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
