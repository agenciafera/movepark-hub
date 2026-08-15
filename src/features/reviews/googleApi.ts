import { supabase } from "@/lib/supabase";
import type { GooglePlaceSnapshot, GoogleReviewItem } from "@/types/domain";
import { GOOGLE_CACHE_DAYS } from "./google.logic";

/**
 * Leitura do espelho `google_place_snapshot` (§4 e §6 de docs/specs/avaliacoes-google.md).
 *
 * Mora fora de `api.ts` e sem hook de propósito: as três superfícies que mostram a nota do
 * Google buscam no LOADER do SSG, porque o bloco e o selo precisam sair no HTML
 * pré-renderizado. Hook renderizaria depois da hidratação, tarde demais para o crawler.
 *
 * As duas funções repetem `is_hidden` e os 30 dias na query, e não é redundância: a policy
 * de leitura filtra os dois, mas a policy de escrita da tabela é `for all` gateada em
 * `is_hub_admin()`, e policies permissivas se somam em OR. Para um hub_admin logado a linha
 * oculta e a vencida voltam do PostgREST. Sem estas condições um admin escondia um lote,
 * abria a ficha logado, continuava vendo o bloco e concluía que a moderação estava quebrada.
 * É o mesmo motivo do filtro explícito no join da RPC `destination_prospect_cards`.
 */

/** O corte de frescor em ISO, para o PostgREST comparar `fetched_at` no servidor. */
function freshCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - GOOGLE_CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

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
    .eq("is_hidden", false)
    .gt("fetched_at", freshCutoff())
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
    .in("place_id", ids)
    .eq("is_hidden", false)
    .gt("fetched_at", freshCutoff());
  if (error) throw error;
  return (data ?? []).map((r) => ({
    place_id: r.place_id,
    rating: r.rating != null ? Number(r.rating) : null,
    user_rating_count: r.user_rating_count ?? 0,
    fetched_at: r.fetched_at,
  }));
}
