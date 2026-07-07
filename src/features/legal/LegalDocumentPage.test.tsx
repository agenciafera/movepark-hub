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
    expect(screen.getByText(/Última atualização/)).toBeInTheDocument();
  });

  it("mostra estado de carregamento sem conteúdo", () => {
    useLegalDocumentMock.mockReturnValue({ data: undefined, isLoading: true });
    render();
    expect(screen.getByRole("heading", { level: 1, name: "Termos de Uso" })).toBeInTheDocument();
    expect(screen.queryByText(/Última atualização/)).not.toBeInTheDocument();
  });
});
