import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { renderWithProviders } from "@/test/utils";
import { LegalDocumentPage } from "./LegalDocumentPage";

const useLegalDocumentMock = vi.fn();
vi.mock("./api", () => ({ useLegalDocument: (slug: string) => useLegalDocumentMock(slug) }));

// DOMPurify não roda no happy-dom (shim de teste); a sanitização é validada no browser real e pela
// própria lib. Aqui testamos só a renderização da página, então usamos pass-through.
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));

function render() {
  return renderWithProviders(
    <HelmetProvider>
      <LegalDocumentPage
        slug="terms"
        title="Termos de Uso"
        description="desc"
        intro="O que vale ao reservar por aqui."
        canonicalPath="/termos"
      />
    </HelmetProvider>,
  );
}

describe("LegalDocumentPage", () => {
  it("renderiza o conteúdo HTML da versão vigente + data", () => {
    useLegalDocumentMock.mockReturnValue({
      data: {
        slug: "terms",
        title: "Termos de Uso",
        version: 3,
        content: "<h2>1. Aceitação</h2><p>Texto do termo aqui.</p>",
        published_at: "2026-07-01T12:00:00Z",
      },
      isLoading: false,
    });
    render();
    expect(screen.getByRole("heading", { level: 1, name: "Termos de Uso" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /1\. Aceitação/ })).toBeInTheDocument();
    expect(screen.getByText("Texto do termo aqui.")).toBeInTheDocument();
    expect(screen.getByText(/Atualizado em/)).toBeInTheDocument();
  });

  /**
   * O índice sai dos `h2` do próprio documento. É o que deixa o jurídico seguir
   * editando no Manager sem precisar declarar seção nenhuma.
   */
  it("monta o índice a partir dos h2 do documento", () => {
    useLegalDocumentMock.mockReturnValue({
      data: {
        slug: "terms",
        title: "Termos de Uso",
        version: 3,
        content:
          "<h2>1. Aceitação</h2><p>a</p><h2>2. Cancelamento e reembolso</h2><p>b</p>",
        published_at: "2026-07-01T12:00:00Z",
      },
      isLoading: false,
    });
    const { container } = render();

    const indice = container.querySelector('nav[aria-label="Nesta página"]');
    const ancoras = [...(indice?.querySelectorAll("a") ?? [])];
    expect(ancoras.map((a) => a.textContent)).toEqual([
      "1. Aceitação",
      "2. Cancelamento e reembolso",
    ]);
    // Âncora de verdade, pra dar pra copiar o link da seção. O prefixo "secao-"
    // existe porque id começando por dígito é seletor CSS inválido.
    expect(ancoras[1]).toHaveAttribute("href", "#secao-2-cancelamento-e-reembolso");
    expect(container.querySelector("#secao-2-cancelamento-e-reembolso")?.tagName).toBe("H2");
  });

  it("documento sem h2 não mostra índice vazio", () => {
    useLegalDocumentMock.mockReturnValue({
      data: {
        slug: "terms",
        title: "Termos de Uso",
        version: 1,
        content: "<p>Texto corrido, sem seções.</p>",
        published_at: "2026-07-01T12:00:00Z",
      },
      isLoading: false,
    });
    const { container } = render();
    expect(container.querySelector('nav[aria-label="Nesta página"]')).toBeNull();
    expect(screen.getByText("Texto corrido, sem seções.")).toBeInTheDocument();
  });

  it("mostra estado de carregamento sem conteúdo", () => {
    useLegalDocumentMock.mockReturnValue({ data: undefined, isLoading: true });
    render();
    expect(screen.getByRole("heading", { level: 1, name: "Termos de Uso" })).toBeInTheDocument();
    expect(screen.queryByText(/Última atualização/)).not.toBeInTheDocument();
  });
});
