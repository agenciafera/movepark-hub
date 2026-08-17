import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHero } from "./PageHero";

describe("PageHero", () => {
  it("o título da página é o h1", () => {
    render(<PageHero title="Fale conosco" />);
    expect(screen.getByRole("heading", { level: 1, name: "Fale conosco" })).toBeInTheDocument();
  });

  it("o lead entra abaixo do título", () => {
    render(<PageHero title="Fale conosco" description="Escolha o canal que preferir." />);
    expect(screen.getByText("Escolha o canal que preferir.")).toBeInTheDocument();
  });

  /**
   * Branco sobre o violeta da marca dá 4.86:1 e passa o AA por pouco. Qualquer
   * translucidez derruba para perto de 3.9:1, que reprova em corpo de 16px, e o
   * desenho de origem sugeria um lead acinzentado.
   */
  it("o lead é branco puro, porque a folga de contraste sobre o violeta é curta", () => {
    render(<PageHero title="Fale conosco" description="Escolha o canal que preferir." />);
    const lead = screen.getByText("Escolha o canal que preferir.");
    expect(lead.className).toContain("text-white");
    expect(lead.className).not.toMatch(/text-white\/\d+/);
  });

  it("a faixa sangra: a cor fica fora do container de leitura", () => {
    const { container } = render(<PageHero title="Fale conosco" />);
    const faixa = container.firstElementChild!;
    expect(faixa.className).toContain("bg-mp-navy");
    expect(faixa.className).not.toContain("max-w-");
    expect(faixa.firstElementChild!.className).toContain("max-w-[1080px]");
  });
});
