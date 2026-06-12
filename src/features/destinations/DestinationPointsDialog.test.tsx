import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { DestinationPointsDialog } from "./DestinationPointsDialog";
import type { Destination } from "@/types/domain";

const destination = {
  id: "dest-1",
  code: "GRU",
  name: "Aeroporto de Guarulhos",
  short_name: "Guarulhos (GRU)",
  slug: "aeroporto-de-guarulhos",
  type: "airport",
  city: "Guarulhos",
  latitude: -23.4356,
  longitude: -46.4731,
} as unknown as Destination;

describe("DestinationPointsDialog — gestão de terminais", () => {
  it("mostra o título do destino e o formulário de adicionar terminal quando aberto", () => {
    renderWithProviders(
      <DestinationPointsDialog open destination={destination} onOpenChange={() => {}} />,
    );
    expect(screen.getByText(/Terminais — Guarulhos \(GRU\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Adicionar terminal/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Latitude/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Longitude/i)).toBeInTheDocument();
  });

  it("pede para salvar o destino antes quando não há id", () => {
    const draft = { ...destination, id: "" } as unknown as Destination;
    renderWithProviders(
      <DestinationPointsDialog open destination={draft} onOpenChange={() => {}} />,
    );
    expect(screen.getByText(/Salve o destino antes de adicionar terminais/i)).toBeInTheDocument();
    expect(screen.queryByText(/Adicionar terminal/i)).not.toBeInTheDocument();
  });
});
