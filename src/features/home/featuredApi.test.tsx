import { describe, expect, it } from "vitest";
import { falha, renderMutation, tabela } from "@/test/msw/supabase";
import {
  useAddFeaturedOffer,
  useRemoveFeaturedOffer,
  useReorderFeaturedOffers,
  useToggleFeaturedOffer,
} from "./featuredApi";

/**
 * Contrato de rede da curadoria da vitrine.
 *
 * O que está em jogo aqui é a home pública: um patch no id errado troca o card de lugar na cara do
 * cliente, e um insert sem `sort_order` deixa o destaque novo empatado em zero na frente de todo
 * mundo. É o tipo de erro que ninguém vê no console.
 */

describe("useAddFeaturedOffer", () => {
  it("insere no fim da lista", async () => {
    const post = tabela("home_featured_offer", "post", { json: { id: "hf-1" } });

    const { result } = renderMutation(() => useAddFeaturedOffer());
    await result.current.mutateAsync({
      locationParkingTypeId: "lpt-9",
      atuais: [{ sort_order: 1 }, { sort_order: 7 }],
    });

    expect(post.ultimoBody).toEqual({ location_parking_type_id: "lpt-9", sort_order: 8 });
  });

  it("primeiro destaque da lista vazia entra na posição 1", async () => {
    const post = tabela("home_featured_offer", "post", { json: { id: "hf-1" } });

    const { result } = renderMutation(() => useAddFeaturedOffer());
    await result.current.mutateAsync({ locationParkingTypeId: "lpt-1", atuais: [] });

    expect((post.ultimoBody as { sort_order: number }).sort_order).toBe(1);
  });

  it("vaga repetida sobe com a mensagem do servidor", async () => {
    // `location_parking_type_id` é unique: a tela filtra o que já está na lista, e o banco é a
    // segunda barreira para duas abas abertas ao mesmo tempo.
    falha("tabela", "home_featured_offer", 409, "duplicate key value");

    const { result } = renderMutation(() => useAddFeaturedOffer());
    await expect(
      result.current.mutateAsync({ locationParkingTypeId: "lpt-9", atuais: [] }),
    ).rejects.toThrow();
  });
});

describe("useToggleFeaturedOffer", () => {
  it("liga e desliga sem tocar na posição", async () => {
    const patch = tabela("home_featured_offer", "patch", { json: [] });

    const { result } = renderMutation(() => useToggleFeaturedOffer());
    await result.current.mutateAsync({ id: "hf-3", isActive: false });

    expect(patch.chamadas[0].url).toContain("id=eq.hf-3");
    expect(patch.ultimoBody).toEqual({ is_active: false });
  });
});

describe("useReorderFeaturedOffers", () => {
  it("grava uma posição por linha, cada uma no seu id", async () => {
    const patch = tabela("home_featured_offer", "patch", { json: [] });

    const { result } = renderMutation(() => useReorderFeaturedOffers());
    await result.current.mutateAsync([
      { id: "hf-a", sort_order: 2 },
      { id: "hf-b", sort_order: 1 },
    ]);

    expect(patch.chamadas).toHaveLength(2);
    expect(patch.chamadas[0].url).toContain("id=eq.hf-a");
    expect(patch.chamadas[0].body).toEqual({ sort_order: 2 });
    expect(patch.chamadas[1].url).toContain("id=eq.hf-b");
    expect(patch.chamadas[1].body).toEqual({ sort_order: 1 });
  });

  it("erro no meio da troca sobe, em vez de deixar meia ordem salva em silêncio", async () => {
    falha("tabela", "home_featured_offer", 500, "conexão caiu");

    const { result } = renderMutation(() => useReorderFeaturedOffers());
    await expect(
      result.current.mutateAsync([
        { id: "hf-a", sort_order: 2 },
        { id: "hf-b", sort_order: 1 },
      ]),
    ).rejects.toThrow();
  });
});

describe("useRemoveFeaturedOffer", () => {
  it("apaga pelo id", async () => {
    // Delete duro de propósito: a tabela não tem `deleted_at`. Tirar um card da vitrine não perde
    // histórico nenhum, e soft delete brigaria com o unique na hora de readicionar a mesma vaga.
    const del = tabela("home_featured_offer", "delete", { json: [] });

    const { result } = renderMutation(() => useRemoveFeaturedOffer());
    await result.current.mutateAsync("hf-7");

    expect(del.chamadas[0].url).toContain("id=eq.hf-7");
  });
});
