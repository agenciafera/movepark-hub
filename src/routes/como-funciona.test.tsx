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

  /**
   * Regressão: o h3 do momento nasceu em `display-xl`, que é FIXO em 28px,
   * embaixo de um h2 em `display-2xl`, que é FLUIDO (26px no mobile, 44px no
   * desktop). Os dois se cruzam: numa tela de 390px o título do momento saía
   * com 28px contra 26,3px do título da seção, ou seja, o subtítulo passava na
   * frente do título. É a armadilha de misturar degrau fixo com degrau fluido
   * em níveis vizinhos, e nenhum teste pegava porque o happy-dom não calcula
   * `clamp()`. O par responsivo mantém a escada descendo em toda largura.
   */
  it("o h3 do momento nunca passa na frente do h2 da seção no mobile", () => {
    renderPage();
    for (const m of JOURNEY) {
      const h3 = screen.getByRole("heading", { level: 3, name: m.title });
      expect(h3.className).toContain("text-display-sm");
      expect(h3.className).toContain("tablet:text-display-xl");
      // `display-xl` sem prefixo é justamente o que valeria no mobile.
      expect(h3.className).not.toMatch(/(^|\s)text-display-xl/);
    }
  });

  it("os dois CTAs de busca são <Button> de 48px", () => {
    renderPage();
    // O do hero manda para a home, onde fica a busca por aeroporto.
    const hero = screen.getByRole("link", { name: /Buscar vaga no meu aeroporto/i });
    expect(hero).toHaveAttribute("href", "/");
    expect(hero.className).toContain("h-12");

    // O fechamento é o `CtaBanner`, o mesmo banner da home desde 18/08/2026.
    const banner = screen.getByRole("link", { name: /^Buscar estacionamento$/i });
    expect(banner).toHaveAttribute("href", "/search");
    expect(banner.className).toContain("h-12");
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
