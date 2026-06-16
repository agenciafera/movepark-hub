import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import {
  SearchFiltersSidebar,
  type DestinationOption,
  type OperatorOption,
} from "./SearchFilters";

const operatorOptions: OperatorOption[] = [
  { slug: "aerovalet", name: "AeroValet", count: 3 },
  { slug: "plenty", name: "Plenty", count: 1 },
];

const destinationOptions: DestinationOption[] = [
  { code: "GRU", name: "Guarulhos", type: "airport", count: 4 },
  { code: "CGH", name: "Congonhas", type: "airport", count: 2 },
];

function baseProps() {
  return {
    hasDestCoords: false,
    operator: [] as string[],
    destinations: [] as string[],
    amenities: [] as string[],
    maxDistanceKm: null,
    operatorOptions,
    destinationOptions,
    facetsLoading: false,
    onOperatorChange: vi.fn(),
    onDestinationsChange: vi.fn(),
    onAmenitiesChange: vi.fn(),
    onMaxDistanceChange: vi.fn(),
    onClearAll: vi.fn(),
    activeCount: 0,
  };
}

describe("SearchFilters", () => {
  it("lista operadoras da faceta com contagem (não empresas globais)", () => {
    renderWithProviders(<SearchFiltersSidebar {...baseProps()} />);
    expect(screen.getByLabelText(/AeroValet/)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("mostra o filtro de destino quando há mais de um destino", () => {
    renderWithProviders(<SearchFiltersSidebar {...baseProps()} />);
    expect(screen.getByText("Destino")).toBeInTheDocument();
    expect(screen.getByLabelText(/Guarulhos/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Congonhas/)).toBeInTheDocument();
  });

  it("esconde o filtro de destino quando há um único destino (busca ancorada)", () => {
    const props = baseProps();
    props.destinationOptions = [destinationOptions[0]];
    renderWithProviders(<SearchFiltersSidebar {...props} />);
    expect(screen.queryByText("Destino")).not.toBeInTheDocument();
  });

  it("toggla destino chamando onDestinationsChange", () => {
    const props = baseProps();
    renderWithProviders(<SearchFiltersSidebar {...props} />);
    fireEvent.click(screen.getByLabelText(/Guarulhos/));
    expect(props.onDestinationsChange).toHaveBeenCalledWith(["GRU"]);
  });

  it("toggla operadora chamando onOperatorChange", () => {
    const props = baseProps();
    renderWithProviders(<SearchFiltersSidebar {...props} />);
    fireEvent.click(screen.getByLabelText(/Plenty/));
    expect(props.onOperatorChange).toHaveBeenCalledWith(["plenty"]);
  });
});
