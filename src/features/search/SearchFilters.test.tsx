import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { SearchFiltersSidebar, type OperatorOption } from "./SearchFilters";

const operatorOptions: OperatorOption[] = [
  { slug: "aerovalet", name: "AeroValet", count: 3 },
  { slug: "plenty", name: "Plenty", count: 1 },
];

function baseProps() {
  return {
    hasDestCoords: false,
    operator: [] as string[],
    amenities: [] as string[],
    maxDistanceKm: null,
    operatorOptions,
    facetsLoading: false,
    onOperatorChange: vi.fn(),
    onAmenitiesChange: vi.fn(),
    onMaxDistanceChange: vi.fn(),
    onClearAll: vi.fn(),
    activeCount: 0,
  };
}

describe("SearchFilters", () => {
  it("lista estacionamentos da faceta com contagem (não empresas globais)", () => {
    renderWithProviders(<SearchFiltersSidebar {...baseProps()} />);
    expect(screen.getByLabelText(/AeroValet/)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("não tem seção de destino (destino é escopo, fica no header)", () => {
    renderWithProviders(<SearchFiltersSidebar {...baseProps()} />);
    expect(screen.queryByText("Destino")).not.toBeInTheDocument();
  });

  it("esconde estacionamento quando há só uma opção (escolher não faz sentido)", () => {
    const props = baseProps();
    props.operatorOptions = [operatorOptions[0]];
    renderWithProviders(<SearchFiltersSidebar {...props} />);
    expect(screen.queryByText("Estacionamento")).not.toBeInTheDocument();
  });

  it("toggla estacionamento chamando onOperatorChange", () => {
    const props = baseProps();
    renderWithProviders(<SearchFiltersSidebar {...props} />);
    fireEvent.click(screen.getByLabelText(/Plenty/));
    expect(props.onOperatorChange).toHaveBeenCalledWith(["plenty"]);
  });
});
