import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { SearchFiltersSidebar } from "./SearchFilters";

/**
 * E2.1.3: o filtro por estacionamento (marca) saiu, e o tipo de vaga desceu do topo pra sidebar.
 * https://app.clickup.com/t/86ajmwawc
 */
function baseProps() {
  return {
    hasDestCoords: false,
    category: [] as string[],
    amenities: [] as string[],
    maxDistanceKm: null,
    facetsLoading: false,
    availableAmenities: [] as string[],
    onCategoryChange: vi.fn(),
    onAmenitiesChange: vi.fn(),
    onMaxDistanceChange: vi.fn(),
    onClearAll: vi.fn(),
    activeCount: 0,
  };
}

describe("SearchFilters", () => {
  it("tem a seção de tipo de vaga (movida do topo)", () => {
    renderWithProviders(<SearchFiltersSidebar {...baseProps()} />);
    expect(screen.getByText("Tipo de vaga")).toBeInTheDocument();
  });

  it("não filtra por estacionamento (marca não é filtro)", () => {
    renderWithProviders(<SearchFiltersSidebar {...baseProps()} />);
    expect(screen.queryByText("Estacionamento")).not.toBeInTheDocument();
  });

  it("não tem seção de destino (destino é escopo, fica no header)", () => {
    renderWithProviders(<SearchFiltersSidebar {...baseProps()} />);
    expect(screen.queryByText("Destino")).not.toBeInTheDocument();
  });
});
