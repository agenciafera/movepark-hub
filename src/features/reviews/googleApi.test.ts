import { describe, expect, it } from "vitest";
import { tabela } from "@/test/msw/supabase";
import { fetchGooglePlaceSnapshot, fetchGoogleRatings } from "./googleApi";

/**
 * O que estes testes travam: as duas leituras do espelho filtram `is_hidden` e os 30 dias
 * NA QUERY, e não só na policy.
 *
 * O motivo é o mesmo já registrado na migration da RPC `destination_prospect_cards`: a
 * policy de escrita da tabela é `for all` gateada em `is_hub_admin()`, e policies permissivas
 * se somam em OR. Um hub_admin logado lê a linha oculta e a vencida pela policy de escrita,
 * por cima da de leitura. Sem estes filtros, o admin escondia um lote, abria a ficha logado,
 * continuava vendo o bloco e concluía que a moderação estava quebrada.
 */

/** O `fetched_at=gt.<iso>` que o PostgREST recebe, extraído da URL da chamada. */
function corteDeFrescor(url: string): Date {
  const bruto = new URL(url).searchParams.get("fetched_at");
  expect(bruto).toMatch(/^gt\./);
  return new Date(bruto!.slice("gt.".length));
}

const TRINTA_DIAS = 30 * 24 * 60 * 60 * 1000;

describe("fetchGooglePlaceSnapshot", () => {
  it("pede só linha visível e dentro dos 30 dias, sem depender da policy", async () => {
    const espiao = tabela("google_place_snapshot", "get", { json: [] });

    await fetchGooglePlaceSnapshot("ChIJ_x");

    const url = espiao.chamadas[0].url;
    expect(url).toContain("place_id=eq.ChIJ_x");
    expect(url).toContain("is_hidden=eq.false");
    // Margem generosa: o corte é calculado com `Date.now()` na hora da chamada, então a
    // asserção olha a ordem de grandeza (30 dias atrás), não o milissegundo.
    const corte = corteDeFrescor(url);
    expect(Date.now() - corte.getTime()).toBeGreaterThan(TRINTA_DIAS - 60_000);
    expect(Date.now() - corte.getTime()).toBeLessThan(TRINTA_DIAS + 60_000);
  });

  it("converte a nota, que o PostgREST devolve como string", async () => {
    tabela("google_place_snapshot", "get", {
      json: [
        {
          place_id: "ChIJ_x",
          rating: "4.6",
          user_rating_count: 312,
          maps_uri: "https://maps.google.com/?cid=1",
          reviews: [],
          fetched_at: "2026-08-11T03:00:00Z",
        },
      ],
    });

    const snap = await fetchGooglePlaceSnapshot("ChIJ_x");

    expect(snap?.rating).toBe(4.6);
    expect(snap?.user_rating_count).toBe(312);
  });
});

describe("fetchGoogleRatings", () => {
  it("pede só linha visível e dentro dos 30 dias, sem depender da policy", async () => {
    const espiao = tabela("google_place_snapshot", "get", { json: [] });

    await fetchGoogleRatings(["ChIJ_a", "ChIJ_b"]);

    const url = espiao.chamadas[0].url;
    expect(url).toContain("is_hidden=eq.false");
    const corte = corteDeFrescor(url);
    expect(Date.now() - corte.getTime()).toBeGreaterThan(TRINTA_DIAS - 60_000);
    expect(Date.now() - corte.getTime()).toBeLessThan(TRINTA_DIAS + 60_000);
  });

  it("não bate no banco quando a lista de place_ids está vazia", async () => {
    const espiao = tabela("google_place_snapshot", "get", { json: [] });

    expect(await fetchGoogleRatings([])).toEqual([]);
    expect(espiao.chamadas).toHaveLength(0);
  });
});
