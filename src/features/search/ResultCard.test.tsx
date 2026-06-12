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

  it("mostra o terminal mais próximo quando presente (PRD-09)", () => {
    renderWithProviders(
      <ResultCard
        item={item({}, { nearest_terminal: { name: "Terminal 2", distance_km: 0.48 } })}
        isSaved={false}
        onToggleSave={vi.fn()}
        searchParams={new URLSearchParams()}
      />,
    );
    expect(screen.getByText(/mais perto do Terminal 2/i)).toBeInTheDocument();
  });

  it("sem terminal: não renderiza o badge de proximidade", () => {
    renderWithProviders(
      <ResultCard item={item()} isSaved={false} onToggleSave={vi.fn()} searchParams={new URLSearchParams()} />,
    );
    expect(screen.queryByText(/mais perto do/i)).toBeNull();
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

  it("quase-lotação: mostra a mensagem e continua clicável", () => {
    const { container } = renderWithProviders(
      <ResultCard
        item={item({ near_capacity: true, near_capacity_message: "Últimas 2 vagas" })}
        isSaved={false}
        onToggleSave={vi.fn()}
        searchParams={new URLSearchParams()}
      />,
    );
    expect(screen.getByText("Últimas 2 vagas")).toBeInTheDocument();
    expect(container.querySelector("a")).not.toBeNull();
  });
});
