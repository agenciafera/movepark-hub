import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderMutation, rpc, tabela } from "@/test/msw/supabase";
import { useFeaturedOffers } from "./api";

/**
 * Contrato de rede da vitrine da home.
 *
 * O que está em jogo é o preço que o cliente vê antes de clicar em qualquer coisa. A regra:
 * quem calcula é o motor (`lowest_daily_rate`), e lote sem preço não vira card.
 */

const curadoria = (over: Record<string, unknown> = {}) => ({
  id: "lpt-1",
  location_id: "loc-1",
  sort_order: 1,
  public_path: "/estacionamentos/aeroporto-viracopos/virapark",
  ...over,
});

const unidade = (over: Record<string, unknown> = {}) => ({
  id: "loc-1",
  name: "Virapark",
  slug: "virapark",
  public_name: "Virapark - Estacionamento Aeroporto Viracopos",
  review_avg: 4.8,
  review_count: 120,
  company: { id: "c-1", name: "Virapark", slug: "virapark", status: "active" },
  destination: { id: "d-1", code: "VCP", name: "Viracopos", short_name: "Viracopos", slug: "vcp" },
  amenities: [{ amenity_code: "shuttle_free" }],
  photos: ["https://x/capa.webp"],
  go2park_enabled: true,
  ...over,
});

const vaga = (over: Record<string, unknown> = {}) => ({
  id: "lpt-1",
  location_id: "loc-1",
  company_parking_type: { parking_type: { code: "covered", name: "Vaga Coberta" } },
  ...over,
});

const diaria = (over: Record<string, unknown> = {}) => ({
  location_parking_type_id: "lpt-1",
  days: 7,
  total: "174.30",
  old_total: null,
  daily: "24.90",
  min_stay_days: null,
  ...over,
});

describe("useFeaturedOffers", () => {
  it("o card sai com a menor diária do lote, não com o preço de 1 diária", async () => {
    rpc("home_featured_offers", { json: [curadoria()] });
    tabela("location", "get", { json: [unidade()] });
    tabela("location_parking_type", "get", { json: [vaga()] });
    const preco = rpc("lowest_daily_rate", { json: [diaria()] });

    const { result } = renderMutation(() => useFeaturedOffers());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // O motor é consultado com os lotes que a curadoria escolheu, e só com eles.
    expect(preco.ultimoBody).toEqual({ p_lpt_ids: ["lpt-1"] });
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].price_from).toBe(174.3);
    expect(result.current.data?.[0].price_days).toBe(7);
  });

  it("lote sem preço no motor fica de fora, em vez de virar card sem valor", async () => {
    rpc("home_featured_offers", { json: [curadoria()] });
    tabela("location", "get", { json: [unidade()] });
    tabela("location_parking_type", "get", { json: [vaga()] });
    rpc("lowest_daily_rate", { json: [] });

    const { result } = renderMutation(() => useFeaturedOffers());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });

  it("respeita a ordem da curadoria, e não a que o PostgREST devolveu", async () => {
    rpc("home_featured_offers", {
      json: [curadoria({ id: "lpt-2", sort_order: 1 }), curadoria({ id: "lpt-1", sort_order: 2 })],
    });
    tabela("location", "get", { json: [unidade()] });
    tabela("location_parking_type", "get", {
      json: [vaga(), vaga({ id: "lpt-2" })],
    });
    rpc("lowest_daily_rate", {
      json: [
        diaria(),
        diaria({ location_parking_type_id: "lpt-2", daily: "40.00", total: "40.00", days: 1 }),
      ],
    });

    const { result } = renderMutation(() => useFeaturedOffers());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((o) => o.id)).toEqual(["lpt-2", "lpt-1"]);
  });
});
