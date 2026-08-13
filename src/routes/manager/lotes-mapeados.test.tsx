import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { ProspectLocationAdminRow } from "@/types/domain";

// Refs estáveis: o mock precisa devolver o MESMO objeto a cada render, senão o efeito que
// ressincroniza o formulário dispara sem parar.
const { rows, setStateMutate, deleteMutate, saveMutate, precheckMutate } = vi.hoisted(() => ({
  rows: { current: [] as unknown[] },
  setStateMutate: vi.fn(),
  deleteMutate: vi.fn(),
  saveMutate: vi.fn(),
  precheckMutate: vi.fn(),
}));

vi.mock("@/features/prospect-locations/api", () => ({
  useProspectLocations: () => ({ data: rows.current, isLoading: false }),
  useSaveProspectLocation: () => ({ mutateAsync: saveMutate, isPending: false }),
  useSetProspectLocationState: () => ({ mutateAsync: setStateMutate, isPending: false }),
  useDeleteProspectLocation: () => ({ mutateAsync: deleteMutate, isPending: false }),
  useProspectLocationPrecheck: () => ({ mutateAsync: precheckMutate, isPending: false }),
}));

vi.mock("@/features/destinations/api", () => ({
  useAdminDestinations: () => ({
    data: [{ id: "d1", name: "Aeroporto do Recife", slug: "recife" }],
    isLoading: false,
  }),
}));

vi.mock("@/features/amenities/api", () => ({
  useAmenityCatalog: () => ({ data: [], isLoading: false }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ManagerLotesMapeados from "./lotes-mapeados";

function makeRow(over: Partial<ProspectLocationAdminRow>): ProspectLocationAdminRow {
  return {
    id: "p0",
    destination_id: "d1",
    destination_name: "Aeroporto do Recife",
    destination_slug: "recife",
    name: "Lote",
    slug: "lote",
    address: "Rua Teste, 100",
    phone: null,
    latitude: -8.13,
    longitude: -34.92,
    google_place_id: null,
    google_maps_url: null,
    amenities: [],
    description: null,
    data_source: "manual",
    is_published: false,
    notified_owner_at: null,
    last_reviewed_at: null,
    converted_location_id: null,
    converted_at: null,
    converted_location_name: null,
    converted_company_id: null,
    state: "draft",
    distance_m: 1200,
    place_id_conflict_name: null,
    created_at: "2026-08-01T12:00:00Z",
    updated_at: "2026-08-01T12:00:00Z",
    ...over,
  };
}

const publicavel = makeRow({ id: "p1", name: "Talentos Park", slug: "talentos-park" });
const semEndereco = makeRow({
  id: "p2",
  name: "Lote Sem Rua",
  slug: "lote-sem-rua",
  address: null,
});
const convertido = makeRow({
  id: "p3",
  name: "Virapark Recife",
  slug: "virapark-recife",
  state: "converted",
  is_published: false,
  converted_at: "2026-08-05T10:00:00Z",
  converted_location_id: "loc-9",
  converted_location_name: "Virapark Unidade Recife",
  converted_company_id: "comp-9",
});
const colidindo = makeRow({
  id: "p4",
  name: "Lote Duplicado",
  slug: "lote-duplicado",
  google_place_id: "ChIJabc",
  place_id_conflict_name: "Aeropark Guarulhos",
});

describe("ManagerLotesMapeados", () => {
  beforeEach(() => {
    setStateMutate.mockReset();
    setStateMutate.mockResolvedValue(undefined);
    deleteMutate.mockReset();
    rows.current = [publicavel, semEndereco, convertido, colidindo];
  });

  it("renderiza o título e as linhas da lista", () => {
    renderWithProviders(<ManagerLotesMapeados />);
    expect(screen.getByText("Lotes mapeados")).toBeInTheDocument();
    expect(screen.getByText("Talentos Park")).toBeInTheDocument();
    expect(screen.getByText("Lote Sem Rua")).toBeInTheDocument();
    expect(screen.getByText("Virapark Recife")).toBeInTheDocument();
  });

  it("linha sem endereço avisa e trava o Switch de publicar", () => {
    // É o gate de publicação: ficha sem endereço é thin content na página do destino,
    // e o servidor recusa a publicação de qualquer jeito.
    renderWithProviders(<ManagerLotesMapeados />);
    expect(screen.getByText("Sem endereço")).toBeInTheDocument();
    expect(screen.getByLabelText("Publicado: Lote Sem Rua")).toBeDisabled();
    expect(screen.getByLabelText("Publicado: Talentos Park")).not.toBeDisabled();
  });

  it("ficha convertida fica somente leitura (Switch e ações desabilitados)", () => {
    renderWithProviders(<ManagerLotesMapeados />);
    expect(screen.getByLabelText("Publicado: Virapark Recife")).toBeDisabled();
    expect(screen.getByLabelText("Ações de Virapark Recife")).toBeDisabled();
    expect(screen.getByText("Convertido")).toBeInTheDocument();
    expect(screen.getByText("Virou Virapark Unidade Recife")).toBeInTheDocument();
  });

  it("alternar o Switch publica a ficha", async () => {
    renderWithProviders(<ManagerLotesMapeados />);
    fireEvent.click(screen.getByLabelText("Publicado: Talentos Park"));
    await waitFor(() => expect(setStateMutate).toHaveBeenCalledTimes(1));
    expect(setStateMutate).toHaveBeenCalledWith({ id: "p1", isPublished: true });
  });

  it("avisa quando o Place ID já é de uma unidade parceira", () => {
    renderWithProviders(<ManagerLotesMapeados />);
    expect(screen.getByText(/Já é da unidade Aeropark Guarulhos/)).toBeInTheDocument();
  });
});
