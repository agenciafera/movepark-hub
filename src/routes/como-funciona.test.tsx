import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { renderWithProviders } from "@/test/utils";
import ComoFuncionaPage from "@/routes/como-funciona";

function renderPage() {
  return renderWithProviders(
    <HelmetProvider>
      <ComoFuncionaPage />
    </HelmetProvider>,
  );
}

describe("ComoFuncionaPage — contrato de página de conteúdo", () => {
  it("abre com um único h1 (via PageHeader)", () => {
    renderPage();
    const h1 = screen.getAllByRole("heading", { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0]).toHaveTextContent(/Reserve sua vaga/i);
  });

  it("o CTA final é um <Button> de 48px apontando para a home", () => {
    renderPage();
    const cta = screen.getByRole("link", { name: /Buscar estacionamento/i });
    expect(cta).toHaveAttribute("href", "/");
    expect(cta.className).toContain("h-12");
  });

  it("os títulos de seção usam o token de heading de conteúdo (display-sm)", () => {
    renderPage();
    const secao = screen.getByRole("heading", { level: 2, name: "Antes da viagem" });
    expect(secao.className).toContain("text-display-sm");
  });

  /**
   * A numeração atravessa as seções: quem lê percebe um fluxo de quatro passos,
   * não duas listas soltas de dois.
   */
  it("os passos são numerados de 1 a 4 através das seções", () => {
    const { container } = renderPage();
    // Fora das listas de navegação: a trilha de abertura também é `ol`, e o
    // separador dela entrava na conta.
    const passos = [...container.querySelectorAll("ol")].filter((ol) => !ol.closest("nav"));
    const badges = passos
      .flatMap((ol) => [...ol.querySelectorAll("li > span:first-child")])
      .map((s) => s.textContent);
    expect(badges).toEqual(["1", "2", "3", "4"]);
  });
});
