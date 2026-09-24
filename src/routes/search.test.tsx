import { describe, expect, it, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import SearchResultsPage from "@/routes/search";
import { useSearchResults } from "@/features/search/useSearchResults";

// Só o hook de dados é mockado; o resto do módulo (tipos, helpers) continua real.
vi.mock("@/features/search/useSearchResults", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/search/useSearchResults")>();
  return { ...actual, useSearchResults: vi.fn() };
});

beforeEach(() => {
  vi.mocked(useSearchResults).mockReturnValue({
    data: { results: [] },
    isLoading: false,
    error: null,
  } as never);
});

function render(route = "/search?dest=GRU") {
  return renderWithProviders(<SearchResultsPage />, { route });
}

/**
 * Regressão: `/search?dest=X&from=Y&to=Z&vaga=W&src=V` combina em milhares de URLs
 * (as datas padrão rolam com o dia, ver `resolveSearchDates`), e sem noindex o Google
 * indexa cada uma como cópia sem canônica. 460 páginas em Search Console em 20/09/2026,
 * ver docs/specs/seo-indexacao.md.
 */
describe("SearchResultsPage: indexação", () => {
  it("marca noindex com qualquer combinação de filtro na URL", async () => {
    render("/search?dest=VCP&from=2026-09-08T19:00:00.000Z&to=2026-09-10T19:00:00.000Z&vaga=covered&src=destino");
    await waitFor(() => {
      const robots = document.head.querySelector('meta[name="robots"]');
      expect(robots).toBeTruthy();
      expect(robots!.getAttribute("content")).toBe("noindex, follow");
    });
  });

  it("marca noindex mesmo em /search sem nenhum parâmetro", async () => {
    render("/search");
    await waitFor(() => {
      const robots = document.head.querySelector('meta[name="robots"]');
      expect(robots).toBeTruthy();
      expect(robots!.getAttribute("content")).toBe("noindex, follow");
    });
  });
});
