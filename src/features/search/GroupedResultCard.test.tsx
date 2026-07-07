import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { GroupedResultCard } from "./GroupedResultCard";
import type { GroupedSearchResult, ParkingTypeOption } from "./useSearchResults";

function parkingType(
  overrides: Partial<ParkingTypeOption["availability"]> = {},
): ParkingTypeOption {
  return {
    lpt_id: "lpt-1",
    code: "covered",
    name: "Vaga coberta",
    price: { total: 159.5, old_price: null, per_day: 31.9, days: 5 },
    availability: {
      remaining: 10,
      sold_out: false,
      near_capacity: false,
      near_capacity_message: null,
      ...overrides,
    },
  };
}

function item(
  overrides: Partial<ParkingTypeOption["availability"]> = {},
  locationOverrides: Partial<GroupedSearchResult["location"]> = {},
): GroupedSearchResult {
  const cheapest = parkingType(overrides);
  return {
    location_id: "loc-1",
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
    amenities: ["covered"],
    parking_types: [cheapest],
    min_price: cheapest.price.total,
    cheapest_type: cheapest,
  };
}

describe("GroupedResultCard", () => {
  it("alta demanda (E3.6): mostra badge qualitativo, nunca um número", () => {
    renderWithProviders(
      <GroupedResultCard
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
      <GroupedResultCard
        item={item()}
        isSaved={false}
        onToggleSave={vi.fn()}
        searchParams={new URLSearchParams()}
      />,
    );
    expect(screen.queryByText(/Muito procurado/)).toBeNull();
  });

  it("escassez tem prioridade sobre alta demanda (nunca os dois badges juntos)", () => {
    renderWithProviders(
      <GroupedResultCard
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
