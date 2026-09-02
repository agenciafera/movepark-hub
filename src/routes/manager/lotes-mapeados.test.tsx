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
    researched_daily_brl: null,
    researched_weekly_brl: null,
    researched_biweekly_brl: null,
    researched_monthly_brl: null,
    researched_at: null,
    research_source: null,
    // Depois do spread: o preço pesquisado é o único campo que a lista precisa variar por
    // caso, e antes dele o `...over` era engolido em silêncio.
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
const precoVencido = makeRow({
  id: "p5",
  name: "Lote Com Preço Velho",
  slug: "lote-preco-velho",
  researched_daily_brl: 29.9,
  researched_at: "2026-05-01",
  research_source: "site do lote",
});
const precoNoPrazo = makeRow({
  id: "p6",
  name: "Lote Com Preço Novo",
  slug: "lote-preco-novo",
  researched_daily_brl: 29.9,
  researched_at: "2026-08-29",
  research_source: "site do lote",
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

  it("avisa quem tem preço pesquisado vencido, que já saiu da página sem avisar ninguém", () => {
    // O preço de terceiro vale 90 dias e some da página de destino quando vence. Some em
    // silêncio, então esta lista é o único lugar onde alguém percebe.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T12:00:00Z"));
    rows.current = [precoVencido, precoNoPrazo];
    try {
      renderWithProviders(<ManagerLotesMapeados />);
      expect(screen.getAllByText("Preço vencido")).toHaveLength(1);
      expect(screen.getByText("Lote Com Preço Novo")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
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

  // "Sem Place ID" é a fila de curadoria de endereço: sem essa chave o pino veio de
  // digitação ou importação, e a deduplicação do D-009 não tem em que se apoiar.
  describe("filtro Sem Place ID", () => {
    it("conta quantas fichas estão sem a chave", () => {
      renderWithProviders(<ManagerLotesMapeados />);
      // 3 das 4 linhas da fixture estão sem Place ID.
      expect(screen.getByRole("button", { name: "Sem Place ID (3)" })).toBeInTheDocument();
    });

    it("ligado, esconde quem já tem Place ID", async () => {
      renderWithProviders(<ManagerLotesMapeados />);
      fireEvent.click(screen.getByRole("button", { name: /Sem Place ID/ }));

      await waitFor(() => expect(screen.queryByText("Lote Duplicado")).not.toBeInTheDocument());
      expect(screen.getByText("Talentos Park")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Sem Place ID/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("com a fila zerada, o filtro fica desligado e sem contagem", () => {
      rows.current = [makeRow({ id: "p9", name: "Só Com Chave", google_place_id: "ChIJok" })];
      renderWithProviders(<ManagerLotesMapeados />);
      const botao = screen.getByRole("button", { name: "Sem Place ID" });
      expect(botao).toBeDisabled();
      expect(screen.getByText("Só Com Chave")).toBeInTheDocument();
    });

    it("ligado sem resultado, o vazio explica a fila em vez de pedir cadastro", async () => {
      rows.current = [
        makeRow({ id: "p1", name: "Talentos Park", google_place_id: null }),
        makeRow({ id: "p5", name: "Outro", google_place_id: "ChIJok" }),
      ];
      renderWithProviders(<ManagerLotesMapeados />);
      fireEvent.click(screen.getByRole("button", { name: /Sem Place ID/ }));
      await waitFor(() => expect(screen.queryByText("Outro")).not.toBeInTheDocument());

      // Agora a busca devolve só ficha com chave, e o filtro continua ligado.
      rows.current = [makeRow({ id: "p5", name: "Outro", google_place_id: "ChIJok" })];
      fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), {
        target: { value: "outro" },
      });

      expect(await screen.findByText("Todo mundo já tem Place ID")).toBeInTheDocument();
      expect(screen.queryByText("Nenhum lote mapeado")).not.toBeInTheDocument();
    });
  });
});
