import type { SearchResultItem } from "./useSearchResults";

/**
 * Badges comparativos do card de resultado (PRD-13).
 *
 * São calculados sobre o CONJUNTO de resultados da busca, não fixos por unidade:
 * - "mais barato" / "mais perto" saem de um min() sobre a lista (comparativos);
 * - "traslado" / "coberto" / "valet" saem de flags do parking_type/amenidades (atributos).
 *
 * Regras de ruído (ver docs/specs/customer/search-results.md):
 * - no máximo 2 badges por card (excesso vira ruído);
 * - comparativos só aparecem com ≥2 lotes compráveis e quando há variação real
 *   (se todos têm o mesmo preço/distância, ninguém "ganha" o badge);
 * - lote esgotado não recebe badge (não é comprável).
 */
export type SearchBadgeKind = "cheapest" | "closest" | "shuttle" | "covered" | "valet";

export type SearchBadge = {
  kind: SearchBadgeKind;
  label: string;
};

/** Comparativos primeiro (tiram o foco do "só preço"), atributos depois. */
const PRIORITY: SearchBadgeKind[] = ["cheapest", "closest", "shuttle", "covered", "valet"];
const MAX_BADGES = 2;

/** Distância comparável do lote: ao destino, ou ao terminal mais próximo como fallback. */
function distanceOf(item: SearchResultItem): number | null {
  return item.location.distance_km ?? item.location.nearest_terminal?.distance_km ?? null;
}

export function computeResultBadges(
  item: SearchResultItem,
  all: SearchResultItem[],
): SearchBadge[] {
  if (item.availability?.sold_out) return [];

  const found = new Map<SearchBadgeKind, string>();

  // Universo comparável: só lotes compráveis (disponíveis).
  const available = all.filter((r) => !r.availability?.sold_out);
  const comparable = available.length >= 2;

  // Mais barato — menor price.total, só se houver variação na lista.
  if (comparable) {
    const prices = available.map((r) => r.price.total);
    const min = Math.min(...prices);
    if (Math.max(...prices) > min && item.price.total === min) {
      found.set("cheapest", "Mais barato");
    }
  }

  // Mais perto — menor distância (destino/terminal), só se houver variação.
  if (comparable) {
    const dists = available
      .map(distanceOf)
      .filter((d): d is number => d != null);
    const mine = distanceOf(item);
    if (dists.length >= 2 && mine != null) {
      const min = Math.min(...dists);
      if (Math.max(...dists) > min && mine === min) {
        const terminal = item.location.nearest_terminal?.name;
        found.set("closest", terminal ? `Mais perto do ${terminal}` : "Mais perto");
      }
    }
  }

  // Atributos — flags do parking_type / amenidades.
  const amenities = new Set(item.amenities);
  if (amenities.has("shuttle_free")) found.set("shuttle", "Traslado grátis");
  if (item.parking_type.code === "covered" || amenities.has("covered")) {
    found.set("covered", "Coberto");
  }
  if (item.parking_type.code === "valet" || amenities.has("valet")) {
    found.set("valet", "Valet");
  }

  return PRIORITY.filter((kind) => found.has(kind))
    .slice(0, MAX_BADGES)
    .map((kind) => ({ kind, label: found.get(kind)! }));
}
