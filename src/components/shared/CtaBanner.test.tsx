import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { CtaBanner } from "./CtaBanner";

describe("CtaBanner — contrato de botão, eyebrow e largura", () => {
  it("o CTA é um <Button> de 48px (h-12) apontando para /search", () => {
    renderWithProviders(<CtaBanner />);
    const cta = screen.getByRole("link", { name: /Buscar estacionamento/i });
    expect(cta).toHaveAttribute("href", "/search");
    // h-12 é a altura do <Button> (48px), o alvo de toque do contrato.
    expect(cta.className).toContain("h-12");
  });

  it("o eyebrow não usa o violeta reservado a acionável", () => {
    const { container } = renderWithProviders(<CtaBanner />);
    const eyebrow = container.querySelector("p.uppercase");
    expect(eyebrow).not.toBeNull();
    expect(eyebrow?.className).not.toMatch(/text-mp-primary|text-mp-violet/);
  });

  it("a largura acompanha a página: 1280 na home, 1080 nas de conteúdo", () => {
    const app = renderWithProviders(<CtaBanner />);
    expect(app.container.querySelector(".max-w-\\[1280px\\]")).not.toBeNull();

    const conteudo = renderWithProviders(<CtaBanner largura="conteudo" />);
    expect(conteudo.container.querySelector(".max-w-\\[1080px\\]")).not.toBeNull();
  });
});
