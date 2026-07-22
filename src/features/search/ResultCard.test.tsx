import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { ResultCard } from "./ResultCard";
import type { SearchResultItem } from "./useSearchResults";

function item(
  overrides: Partial<SearchResultItem["availability"]> = {},
  locationOverrides: Partial<SearchResultItem["location"]> = {},
): SearchResultItem {
  return {
    id: "lpt-1",
    operator: { slug: "aerovalet", name: "Aerovalet" },
    location: {
      id: "loc-1",
      slug: "aeroporto-guarulhos",
      name: "Guarulhos",
      address: null,
      latitude: null,
      longitude: null,
      distance_km: 1.2,
      nearest_terminal: null,
      review_avg: null,
      review_count: 0,
      cover_image: null,
      high_demand_today: false,
      ...locationOverrides,
    },
    parking_type: { code: "covered", name: "Vaga coberta" },
    capacity: 10,
    availability: {
      remaining: 10,
      sold_out: false,
      near_capacity: false,
      near_capacity_message: null,
      ...overrides,
    },
    price: { total: 159.5, old_price: null, per_day: 31.9, days: 5 },
    amenities: ["covered"],
  };
}

describe("ResultCard", () => {
  it("disponível: navega para o listing (tem links) e sem badge de esgotado", () => {
    const { container } = renderWithProviders(
      <ResultCard item={item()} isSaved={false} onToggleSave={vi.fn()} searchParams={new URLSearchParams()} />,
    );
    expect(container.querySelector("a")).not.toBeNull();
    expect(screen.queryByText(/Esgotado/)).toBeNull();
  });

  it("esgotado: mostra badge e não é clicável (sem âncoras)", () => {
    const { container } = renderWithProviders(
      <ResultCard
        item={item({ sold_out: true, remaining: 0 })}
        isSaved={false}
        onToggleSave={vi.fn()}
        searchParams={new URLSearchParams()}
      />,
    );
    expect(screen.getByText("Esgotado pro seu período")).toBeInTheDocument();
    expect(container.querySelector("a")).toBeNull();
  });

  it("mostra a distância ao terminal mais próximo na subline (PRD-09)", () => {
    renderWithProviders(
      <ResultCard
        item={item({}, { nearest_terminal: { name: "Terminal 2", distance_km: 0.48 } })}
        isSaved={false}
        onToggleSave={vi.fn()}
        searchParams={new URLSearchParams()}
      />,
    );
    expect(screen.getByTestId("result-card-subline").textContent).toContain("480 m");
  });

  it("sem terminal: a subline mostra só a unidade, sem distância", () => {
    renderWithProviders(
      <ResultCard item={item()} isSaved={false} onToggleSave={vi.fn()} searchParams={new URLSearchParams()} />,
    );
    expect(screen.getByTestId("result-card-subline").textContent).not.toContain("·");
  });

  it("card por tipo: exibe o tipo de vaga como identidade do card (E2.1.3)", () => {
    renderWithProviders(
      <ResultCard item={item()} isSaved={false} onToggleSave={vi.fn()} searchParams={new URLSearchParams()} />,
    );
    expect(screen.getByTestId("result-card-type").textContent).toBe("Vaga coberta");
  });

  it("C-04: amenidade descritora de tipo não vira pill no card (Coberto num card coberto é ruído)", () => {
    // item().amenities = ["covered"], que é descritor de tipo → não pode aparecer como amenidade.
    renderWithProviders(
      <ResultCard item={item()} isSaved={false} onToggleSave={vi.fn()} searchParams={new URLSearchParams()} />,
    );
    expect(screen.queryByTestId("result-card-amenities")).toBeNull();
  });

  it("link do card aponta para o tipo de vaga do próprio card", () => {
    const { container } = renderWithProviders(
      <ResultCard item={item()} isSaved={false} onToggleSave={vi.fn()} searchParams={new URLSearchParams()} />,
    );
    expect(container.querySelector("a")?.getAttribute("href") ?? "").toContain(
      "/p/aerovalet/aeroporto-guarulhos/covered",
    );
  });

  it("renderiza os badges comparativos quando passados (PRD-13)", () => {
    renderWithProviders(
      <ResultCard
        item={item()}
        isSaved={false}
        onToggleSave={vi.fn()}
        searchParams={new URLSearchParams()}
        badges={[{ kind: "cheapest", label: "Mais barato" }]}
      />,
    );
    expect(screen.getByText("Mais barato")).toBeInTheDocument();
  });

  it("esgotado: não renderiza badges comparativos", () => {
    renderWithProviders(
      <ResultCard
        item={item({ sold_out: true, remaining: 0 })}
        isSaved={false}
        onToggleSave={vi.fn()}
        searchParams={new URLSearchParams()}
        badges={[{ kind: "cheapest", label: "Mais barato" }]}
      />,
    );
    expect(screen.queryByText("Mais barato")).toBeNull();
  });

  it("inclui src= e preserva os filtros no link quando source é passado (E2.1.1)", () => {
    const { container } = renderWithProviders(
      <ResultCard
        item={item()}
        isSaved={false}
        onToggleSave={vi.fn()}
        searchParams={new URLSearchParams({ from: "2026-06-22", to: "2026-06-25" })}
        source="search"
      />,
    );
    const href = container.querySelector("a")?.getAttribute("href") ?? "";
    expect(href).toContain("src=search");
    expect(href).toContain("from=2026-06-22");
    expect(href).toContain("to=2026-06-25");
  });

  it("sem source: não injeta src no link", () => {
    const { container } = renderWithProviders(
      <ResultCard item={item()} isSaved={false} onToggleSave={vi.fn()} searchParams={new URLSearchParams()} />,
    );
    expect(container.querySelector("a")?.getAttribute("href") ?? "").not.toContain("src=");
  });

  it("quase-lotação: mostra contagem real de vagas e continua clicável", () => {
    const { container } = renderWithProviders(
      <ResultCard
        item={item({ near_capacity: true, remaining: 2 })}
        isSaved={false}
        onToggleSave={vi.fn()}
        searchParams={new URLSearchParams()}
      />,
    );
    expect(screen.getByText("Faltam 2 vagas")).toBeInTheDocument();
    expect(container.querySelector("a")).not.toBeNull();
  });

  it("quase-lotação com remaining=0 mostra mensagem customizada", () => {
    renderWithProviders(
      <ResultCard
        item={item({ near_capacity: true, remaining: 0, near_capacity_message: "Últimas vagas" })}
        isSaved={false}
        onToggleSave={vi.fn()}
        searchParams={new URLSearchParams()}
      />,
    );
    expect(screen.getByText("Últimas vagas")).toBeInTheDocument();
  });

  it("alta demanda (E3.6): mostra badge qualitativo, nunca um número", () => {
    renderWithProviders(
      <ResultCard
        item={item({}, { high_demand_today: true })}
        isSaved={false}
        onToggleSave={vi.fn()}
        searchParams={new URLSearchParams()}
      />,
    );
    expect(screen.getByText("Muito procurado hoje")).toBeInTheDocument();
  });

  it("sem alta demanda: não mostra o badge", () => {
    renderWithProviders(
      <ResultCard item={item()} isSaved={false} onToggleSave={vi.fn()} searchParams={new URLSearchParams()} />,
    );
    expect(screen.queryByText(/Muito procurado/)).toBeNull();
  });

  it("escassez tem prioridade sobre alta demanda (nunca os dois badges juntos)", () => {
    renderWithProviders(
      <ResultCard
        item={item({ near_capacity: true, remaining: 2 }, { high_demand_today: true })}
        isSaved={false}
        onToggleSave={vi.fn()}
        searchParams={new URLSearchParams()}
      />,
    );
    expect(screen.getByText("Faltam 2 vagas")).toBeInTheDocument();
    expect(screen.queryByText(/Muito procurado/)).toBeNull();
  });
});
