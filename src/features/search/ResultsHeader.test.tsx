import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { ResultsHeader } from "./ResultsHeader";
import type { SearchResponse } from "./useSearchResults";

function resposta(destination: SearchResponse["destination"], total: number): SearchResponse {
  return { destination, days: 1, total, limit: 20, offset: 0, results: [] };
}

const semDatas = { from: null, to: null };

describe("ResultsHeader — o título do resultado", () => {
  it("nomeia o destino quando a busca tem um", () => {
    renderWithProviders(
      <ResultsHeader
        data={resposta({ code: "GRU", name: "Guarulhos", latitude: 0, longitude: 0 }, 12)}
        isLoading={false}
        sort="price_asc"
        onSortChange={vi.fn()}
        {...semDatas}
      />,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("12 vagas em Guarulhos");
  });

  /**
   * Buscar sem destino é o "Todos os destinos" do combobox, e é uma busca válida:
   * roda em todos os aeroportos. O fallback antigo era a palavra "destino" solta,
   * e o título saía "12 vagas em destino", que lia como texto não preenchido.
   */
  it("sem destino, diz que a busca cobre todos, e não a palavra 'destino' solta", () => {
    renderWithProviders(
      <ResultsHeader
        data={resposta(null, 12)}
        isLoading={false}
        sort="price_asc"
        onSortChange={vi.fn()}
        {...semDatas}
      />,
    );

    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("12 vagas em todos os destinos");
    expect(h1.textContent).not.toMatch(/vagas em destino$/);
  });
});
