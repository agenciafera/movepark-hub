import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { renderWithProviders } from "@/test/utils";
import ComoFuncionaPage from "@/routes/como-funciona";
import { JOURNEY, JOURNEY_COMPARISON, JOURNEY_FAQ } from "@/features/how-it-works/journey";

function renderPage() {
  return renderWithProviders(
    <HelmetProvider>
      <ComoFuncionaPage />
    </HelmetProvider>,
  );
}

describe("ComoFuncionaPage — contrato de hero de marca", () => {
  it("abre com um único h1, no tier fluido de abertura", () => {
    renderPage();
    const h1 = screen.getAllByRole("heading", { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0]).toHaveTextContent(/Sua vaga garantida antes de sair de casa/i);
    expect(h1[0].className).toContain("text-display-3xl");
    expect(h1[0].className).toContain("text-balance");
  });

  /** Checklist 1 da skill `harmonizar-paginas`: nenhum h2 pesa mais que o h1. */
  it("os h2 de seção ficam um degrau abaixo do h1", () => {
    renderPage();
    const h2 = screen.getAllByRole("heading", { level: 2 });
    expect(h2.length).toBeGreaterThan(0);
    for (const h of h2) expect(h.className).toContain("text-display-2xl");
  });

  /**
   * A numeração atravessa os três momentos: quem lê percebe um fluxo de sete
   * passos, não três listas soltas.
   */
  it("os passos são numerados de 1 a 7 através dos momentos", () => {
    const { container } = renderPage();
    const passos = [...container.querySelectorAll("ol")].filter((ol) => !ol.closest("nav"));
    const badges = passos
      .flatMap((ol) => [...ol.querySelectorAll("li > span:first-child")])
      .map((s) => s.textContent);
    expect(badges).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });

  it("cada momento entra com o próprio h3", () => {
    renderPage();
    for (const m of JOURNEY) {
      expect(screen.getByRole("heading", { level: 3, name: m.title })).toBeInTheDocument();
    }
  });

  it("os dois CTAs de busca são <Button> de 48px apontando para a home", () => {
    renderPage();
    const ctas = [
      screen.getByRole("link", { name: /Buscar vaga no meu aeroporto/i }),
      screen.getByRole("link", { name: /^Buscar vaga$/i }),
    ];
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/");
      expect(cta.className).toContain("h-12");
    }
  });

  /**
   * ADR-002: crawler de IA não executa JS. Com `forceMount` a resposta continua
   * no DOM com o item fechado, então ela sai no HTML do build e bate com o
   * `FAQPage` emitido no Helmet.
   */
  it("as respostas do FAQ ficam no DOM mesmo com o item fechado", () => {
    renderPage();
    for (const f of JOURNEY_FAQ) {
      expect(screen.getByText(f.a)).toBeInTheDocument();
    }
  });

  it("a comparação mostra os dois lados de cada linha", () => {
    renderPage();
    for (const c of JOURNEY_COMPARISON) {
      expect(screen.getByText(c.mp)).toBeInTheDocument();
      expect(screen.getByText(c.other)).toBeInTheDocument();
    }
  });
});
