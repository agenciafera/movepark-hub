import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

vi.mock("./api", () => ({
  useDestinations: () => ({ data: [] }),
  useAllDestinationPoints: () => ({ data: [] }),
}));

import { SearchBarPill } from "./SearchBarPill";

/**
 * Sobe do rótulo até o primeiro ancestral que carrega padding horizontal de verdade. O gatilho do
 * Select traz o `px-4` do primitivo, mas zerado por `!p-0` na mesma lista: quem espaça o campo é o
 * wrapper acima dele.
 */
function paddingDoCampo(rotulo: string): string {
  let el: HTMLElement | null = screen.getByText(rotulo);
  while (el) {
    if (/!p-0/.test(el.className)) {
      el = el.parentElement;
      continue;
    }
    const px = el.className
      .split(/\s+/)
      .filter((c) => /^(tablet:|desktop:)?px-/.test(c))
      .sort();
    if (px.length) return px.join(" ");
    el = el.parentElement;
  }
  return "";
}

/**
 * O respiro dos campos mora em `searchFieldStyles` porque cada campo é um arquivo diferente
 * (destino, datas, veículo). Enquanto cada um trazia o próprio padding, o veículo ficou com `px-4`
 * contra `px-6` dos vizinhos e o rótulo colava na divisória. Este teste é o que trava o desvio.
 */
describe("SearchBarPill — respiro dos campos", () => {
  it("os quatro campos abrem à mesma distância da divisória", () => {
    renderWithProviders(<SearchBarPill />);
    const padding = ["Onde", "Check-in", "Check-out", "Veículo"].map(paddingDoCampo);
    expect(padding[0]).toBe("px-6");
    expect(new Set(padding).size).toBe(1);
  });

  it("rótulo e valor guardam a mesma folga em todos os campos", () => {
    renderWithProviders(<SearchBarPill />);
    for (const rotulo of ["Onde", "Check-in", "Check-out", "Veículo"]) {
      expect(screen.getByText(rotulo).parentElement?.className).toContain("gap-1");
    }
  });

  it("a divisória do pill é um traço curto, não uma régua de borda a borda", () => {
    const { container } = renderWithProviders(<SearchBarPill />);
    const barra = container.querySelector("form")!;
    expect(barra.innerHTML).not.toContain("tablet:border-r");
    expect(barra.querySelectorAll("[class*='tablet:after:h-1/2']").length).toBe(4);
  });
});
