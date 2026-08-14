import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import type { ProspectLocationAdminRow } from "@/types/domain";

const { saveMutate, precheckMutate, toastError } = vi.hoisted(() => ({
  saveMutate: vi.fn(),
  precheckMutate: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("./api", () => ({
  useSaveProspectLocation: () => ({ mutateAsync: saveMutate, isPending: false }),
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

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: toastError } }));

vi.mock("@/components/shared/LocationMapPreview", () => ({
  LocationMapPreview: () => null,
}));

/**
 * O caminho de produção é com a key do Maps presente: `isGooglePlacesEnabled` ligado
 * esconde os campos manuais de lat/lng, então o único jeito de fixar o ponto é escolher
 * um resultado do Google. O botão do mock encena essa escolha.
 */
const PLACE = {
  address: "Av. Mascarenhas de Morais, 5000 - Imbiribeira, Recife - PE",
  latitude: -8.1265,
  longitude: -34.9231,
  placeId: "ChIJnovoplaceid",
};

vi.mock("@/components/shared/GooglePlacesAutocomplete", () => ({
  isGooglePlacesEnabled: true,
  GooglePlacesAutocomplete: ({
    id,
    value,
    onChange,
    onSelect,
  }: {
    id?: string;
    value: string;
    onChange: (v: string) => void;
    onSelect: (p: typeof PLACE) => void;
  }) => (
    <div>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" onClick={() => onSelect(PLACE)}>
        escolher no Google
      </button>
    </div>
  ),
}));

import { ProspectLocationForm } from "./ProspectLocationForm";

function makeRow(over: Partial<ProspectLocationAdminRow> = {}): ProspectLocationAdminRow {
  return {
    id: "p1",
    destination_id: "d1",
    destination_name: "Aeroporto do Recife",
    destination_slug: "recife",
    name: "Talentos Park",
    slug: "talentos-park",
    address: "Rua antiga, 100",
    phone: null,
    latitude: -8.1,
    longitude: -34.9,
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

/** Abre o modal de endereço, escolhe o resultado do Google e confirma. */
async function buscarEndereco() {
  await userEvent.click(screen.getByRole("button", { name: /endereço/i }));
  const modal = await screen.findByRole("dialog", { name: "Endereço da unidade" });
  await userEvent.click(within(modal).getByRole("button", { name: "escolher no Google" }));
  await userEvent.click(within(modal).getByRole("button", { name: "Usar este endereço" }));
}

describe("ProspectLocationForm", () => {
  beforeEach(() => {
    saveMutate.mockReset();
    saveMutate.mockResolvedValue(undefined);
    precheckMutate.mockReset();
    precheckMutate.mockResolvedValue(null);
    toastError.mockReset();
  });

  it("o Place ID é somente leitura: quem cadastra não digita a chave de deduplicação", () => {
    renderWithProviders(<ProspectLocationForm open prospect={makeRow()} onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText("Google Place ID")).toHaveAttribute("readonly");
  });

  it("buscar o endereço traz ponto e Place ID, e a origem do dado vira Google Places", async () => {
    const onOpenChange = vi.fn();
    renderWithProviders(
      <ProspectLocationForm open prospect={makeRow()} onOpenChange={onOpenChange} />,
    );

    await buscarEndereco();

    expect(screen.getByLabelText("Google Place ID")).toHaveValue(PLACE.placeId);
    expect(screen.getByText(PLACE.address)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(saveMutate).toHaveBeenCalledTimes(1));
    expect(saveMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "p1",
        address: PLACE.address,
        latitude: PLACE.latitude,
        longitude: PLACE.longitude,
        googlePlaceId: PLACE.placeId,
        // A origem deixa de ser declaração de quem cadastrou e vira fato.
        dataSource: "google_places",
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("sem ponto no mapa, o erro manda buscar o endereço em vez de pedir número", async () => {
    // Ficha nova: lat/lng só existem depois da busca, porque os campos digitados saíram.
    renderWithProviders(<ProspectLocationForm open prospect={null} onOpenChange={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/^Nome/), "Lote Novo");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(toastError).toHaveBeenCalledWith(
      "Busque o endereço no Google para fixar o ponto no mapa.",
    );
    expect(saveMutate).not.toHaveBeenCalled();
  });

  it("a pré-checagem roda sozinha quando o endereço chega, sem depender de blur", async () => {
    renderWithProviders(<ProspectLocationForm open prospect={makeRow()} onOpenChange={vi.fn()} />);
    precheckMutate.mockClear();

    await buscarEndereco();

    await waitFor(() =>
      expect(precheckMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: PLACE.latitude,
          longitude: PLACE.longitude,
          googlePlaceId: PLACE.placeId,
          id: "p1",
        }),
      ),
    );
  });

  it("avisa quando o Place ID já é de uma unidade parceira", async () => {
    precheckMutate.mockResolvedValue({
      suggested_destination: null,
      place_id_conflict: { kind: "location", name: "Aeropark Recife" },
      slug_conflict: null,
      nearby: [],
    });
    renderWithProviders(<ProspectLocationForm open prospect={makeRow()} onOpenChange={vi.fn()} />);

    await buscarEndereco();

    expect(
      await screen.findByText(/Este Place ID já é do parceiro Aeropark Recife/),
    ).toBeInTheDocument();
  });
});
