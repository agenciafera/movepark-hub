import { supabase } from "@/lib/supabase";
import type { GooglePlaceSnapshot, GoogleReviewItem } from "@/types/domain";

/**
 * Leitura do espelho `google_place_snapshot` (§4 e §6 de docs/specs/avaliacoes-google.md).
 *
 * Mora fora de `api.ts` e sem hook de propósito: as três superfícies que mostram a nota do
 * Google buscam no LOADER do SSG, porque o bloco e o selo precisam sair no HTML
 * pré-renderizado. Hook renderizaria depois da hidratação, tarde demais para o crawler.
 *
 * A policy de leitura já esconde snapshot oculto e vencido, então nenhuma das funções aqui
 * repete o filtro. Quem precisa repetir é a RPC `destination_prospect_cards`, que hub_admin
 * chama por cima da policy de escrita.
 */

/** Uma linha enxuta do espelho, o suficiente para o selo do card. */
export type GoogleRatingRow = {
  place_id: string;
  rating: number | null;
  user_rating_count: number;
  fetched_at: string;
};

/** O snapshot inteiro de um lugar (nota, avaliações, link do Maps). Nulo quando não há. */
export async function fetchGooglePlaceSnapshot(
  placeId: string,
): Promise<GooglePlaceSnapshot | null> {
  const { data, error } = await supabase
    .from("google_place_snapshot")
    .select("place_id, rating, user_rating_count, maps_uri, reviews, fetched_at")
    .eq("place_id", placeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    // `numeric` chega como string no PostgREST.
    rating: data.rating != null ? Number(data.rating) : null,
    reviews: (data.reviews ?? []) as GoogleReviewItem[],
  } as GooglePlaceSnapshot;
}

/**
 * Só a nota de vários lugares de uma vez, para a lista de cards do destino.
 *
 * Uma consulta para a página inteira, não uma por card: a página de destino do Guarulhos
 * tem 40 unidades, e 40 requisições no build seriam 40 vezes o mesmo custo por nada.
 */
export async function fetchGoogleRatings(placeIds: string[]): Promise<GoogleRatingRow[]> {
  const ids = [...new Set(placeIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("google_place_snapshot")
    .select("place_id, rating, user_rating_count, fetched_at")
    .in("place_id", ids);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    place_id: r.place_id,
    rating: r.rating != null ? Number(r.rating) : null,
    user_rating_count: r.user_rating_count ?? 0,
    fetched_at: r.fetched_at,
  }));
}
