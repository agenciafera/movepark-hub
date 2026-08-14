// Lógica pura do refresh do Google Places. Sem rede e sem Deno.env → testável.

export const REFRESH_AFTER_DAYS = 7;

export type GoogleReviewItem = {
  rating: number;
  text: string;
  publishTime: string;
  relativePublishTimeDescription: string;
  authorName: string;
  authorPhotoUri: string | null;
  authorUri: string | null;
  reviewUri: string | null;
};

export type SnapshotFreshness = { place_id: string; fetched_at: string };

/**
 * Quais place_ids precisam de refresh: os sem snapshot e os com mais de 7 dias.
 * A janela de 7 dias contra o prazo de 30 do Google dá quatro tentativas antes de o selo
 * sumir da vitrine.
 */
export function selectStale(
  candidates: string[],
  snapshots: SnapshotFreshness[],
  now: Date,
): string[] {
  const cutoff = now.getTime() - REFRESH_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const fresh = new Set(
    snapshots
      .filter((s) => new Date(s.fetched_at).getTime() > cutoff)
      .map((s) => s.place_id),
  );
  return candidates.filter((id) => !fresh.has(id));
}

type RawReview = {
  rating?: number;
  text?: { text?: string };
  publishTime?: string;
  relativePublishTimeDescription?: string;
  googleMapsUri?: string;
  authorAttribution?: { displayName?: string; photoUri?: string; uri?: string };
};

/**
 * Traduz a resposta do Places (New) para a linha do espelho.
 * Review sem nome de autor é DESCARTADA: exibir sem atribuição não é permitido, então
 * guardar um dado que não pode ser mostrado só cria lixo com prazo de validade.
 */
export function mapPlaceDetails(place: unknown): {
  rating: number | null;
  user_rating_count: number;
  maps_uri: string | null;
  reviews: GoogleReviewItem[];
} {
  const p = (place ?? {}) as {
    rating?: number | null;
    userRatingCount?: number | null;
    googleMapsUri?: string | null;
    reviews?: RawReview[];
  };

  const reviews: GoogleReviewItem[] = (p.reviews ?? [])
    .filter((r) => !!r.authorAttribution?.displayName)
    .map((r) => ({
      rating: r.rating ?? 0,
      text: r.text?.text ?? "",
      publishTime: r.publishTime ?? "",
      relativePublishTimeDescription: r.relativePublishTimeDescription ?? "",
      authorName: r.authorAttribution!.displayName!,
      authorPhotoUri: r.authorAttribution?.photoUri ?? null,
      authorUri: r.authorAttribution?.uri ?? null,
      reviewUri: r.googleMapsUri ?? null,
    }));

  return {
    rating: p.rating ?? null,
    user_rating_count: p.userRatingCount ?? 0,
    maps_uri: p.googleMapsUri ?? null,
    reviews,
  };
}
