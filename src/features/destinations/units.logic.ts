/**
 * Semente estática da lista de estacionamentos da página de destino.
 *
 * O problema, medido no `dist/` em 13/08/2026: `dist/destinos/aeroporto-afonso-pena.html`
 * saía com **zero** ocorrências de `/p/`, nenhum nome de unidade e 41 skeletons, porque a
 * lista vinha de `useSearchResults`, que é fetch no cliente. A página que disputa
 * "estacionamento aeroporto curitiba" (12.321 impressões no trimestre) chegava ao crawler
 * sem oferta e sem um único link interno para as unidades.
 *
 * A separação que este arquivo materializa: o que é **fato da unidade** (ela existe naquele
 * destino, o link, o endereço, a distância, a nota, o preço de partida) sai no HTML do
 * build; o que **depende de datas** (vaga restante, esgotado, escassez, total da janela)
 * continua vindo da busca no cliente. Por isso a disponibilidade nasce neutra aqui: afirmar
 * "resta 1 vaga" num HTML congelado seria mentira na primeira hora seguinte, e ADR-009 não
 * permite renderizar promessa que a unidade não sustenta.
 *
 * Lógica pura, sem rede: a query mora em `api.ts` e o teste exercita as regras aqui.
 */
import { calcFromPrice, type PricingRuleRaw } from "@/features/search/fromPrice";
import type { SearchResultItem } from "@/features/search/useSearchResults";
import type { GoogleRatingRow } from "@/features/reviews/googleApi";
import { isSnapshotFresh } from "@/features/reviews/google.logic";

/** Linha crua do PostgREST, no formato do select de `fetchDestinationUnits`. */
export type UnitRow = {
  id: string;
  capacity: number | null;
  is_active: boolean;
  location: {
    id: string;
    slug: string;
    name: string;
    address: string | null;
    latitude: number | string | null;
    longitude: number | string | null;
    review_avg: number | null;
    review_count: number | null;
    google_place_id: string | null;
    photos: unknown;
    is_listed: boolean;
    deleted_at: string | null;
    company: { slug: string; name: string; status: string } | null;
    amenities: { amenity_code: string }[] | null;
  } | null;
  company_parking_type: {
    parking_type: { code: string; name: string } | null;
  } | null;
  pricing_rule: PricingRuleRaw | PricingRuleRaw[] | null;
};

/** Linha da RPC `locations_proximity` (PostGIS, ADR-001: distância nunca é calculada no TS). */
export type ProximityRow = {
  location_id: string;
  distance_km: number | string | null;
  nearest_terminal_name: string | null;
  nearest_terminal_distance_km: number | string | null;
};

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Monta os cards que saem no HTML do build, na mesma ordem que a busca usa na página
 * (`sort: price_asc`). Ordem igual importa: quando a busca do cliente responde e substitui a
 * semente, os cards não podem trocar de lugar na frente de quem está lendo.
 */
export function buildStaticUnits(
  rows: UnitRow[],
  proximity: ProximityRow[],
  google: GoogleRatingRow[] = [],
  now: Date = new Date(),
): SearchResultItem[] {
  const geo = new Map(proximity.map((p) => [p.location_id, p]));
  // Só snapshot fresco entra no HTML. A policy do banco já filtra na leitura, e conferir de
  // novo aqui é o que protege o build: o limite de 30 dias do Google vale para a cópia que
  // fica publicada, e uma linha vencida que escapasse viraria HTML servido por semanas.
  const notas = new Map(
    google.filter((g) => isSnapshotFresh(g.fetched_at, now)).map((g) => [g.place_id, g]),
  );
  const itens: SearchResultItem[] = [];

  for (const row of rows) {
    const loc = row.location;
    const tipo = row.company_parking_type?.parking_type;
    // Os mesmos cortes que a Edge `search` aplica. A RLS pública já filtra quase tudo, mas
    // repetir aqui é barato e evita depender de o embed aninhado nunca falhar em silêncio.
    if (!row.is_active || !loc || !tipo) continue;
    if (!loc.is_listed || loc.deleted_at) continue;
    if (!loc.company || loc.company.status !== "active") continue;

    const regra = Array.isArray(row.pricing_rule) ? row.pricing_rule[0] : row.pricing_rule;
    // Quem só vende estadia longa entra com o preço da menor estadia que vende, em vez de
    // sumir da lista. Sem preço calculável a unidade fica de fora: card sem preço no HTML
    // estático seria pior que card nenhum.
    const from = calcFromPrice(regra ?? null);
    if (!from) continue;

    const p = geo.get(loc.id);
    const nota = loc.google_place_id ? notas.get(loc.google_place_id) : undefined;
    const terminalNome = p?.nearest_terminal_name ?? null;
    const terminalKm = num(p?.nearest_terminal_distance_km ?? null);
    const fotos = Array.isArray(loc.photos) ? (loc.photos as string[]) : [];

    itens.push({
      id: row.id,
      operator: { slug: loc.company.slug, name: loc.company.name },
      location: {
        id: loc.id,
        slug: loc.slug,
        name: loc.name,
        address: loc.address,
        latitude: num(loc.latitude),
        longitude: num(loc.longitude),
        distance_km: num(p?.distance_km ?? null),
        nearest_terminal:
          terminalNome && terminalKm !== null
            ? { name: terminalNome, distance_km: terminalKm }
            : null,
        review_avg: loc.review_avg ?? null,
        review_count: loc.review_count ?? 0,
        // A nota do Google sai no HTML do build, e não só depois que a busca do cliente
        // responde: sem isso a unidade sem avaliação Movepark chegava ao crawler sem selo
        // nenhum, que é justamente o vazio de prova social que a spec existe para fechar.
        // O selo em si continua sendo um só, escolhido pelo `pickCardBadge` no card.
        google_rating: nota?.rating ?? null,
        google_rating_count: nota?.user_rating_count ?? 0,
        cover_image: fotos[0] ?? null,
        // Sinal de demanda depende da janela buscada. Num HTML congelado ele seria uma
        // afirmação sem lastro, então nasce falso e só a busca do cliente pode ligá-lo.
        high_demand_today: false,
      },
      parking_type: { code: tipo.code, name: tipo.name },
      capacity: row.capacity ?? 0,
      availability: {
        remaining: null,
        sold_out: false,
        near_capacity: false,
        near_capacity_message: null,
      },
      price: {
        total: from.price,
        old_price: from.oldPrice,
        per_day: Number((from.price / from.days).toFixed(2)),
        days: from.days,
      },
      min_stay_days: from.days > 1 ? from.days : null,
      amenities: (loc.amenities ?? []).map((a) => a.amenity_code),
    });
  }

  return itens.sort((a, b) => a.price.per_day - b.price.per_day);
}
