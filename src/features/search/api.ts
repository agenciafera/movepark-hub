import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { calcFromPrice } from "./fromPrice";
import { dailySeed, orderPopularRows } from "./popularOrder";

export type Destination = {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  slug: string;
  type: "airport" | "bus_terminal" | "city_center" | "district" | "custom";
  city: string;
  state: string | null;
  country: string;
  latitude: number;
  longitude: number;
  is_popular: boolean;
  sort_order: number;
};

export type ParkingTypeCatalog = {
  id: string;
  code: string;
  name: string;
  description: string | null;
};

export type PopularLocation = {
  id: string;
  name: string;
  slug: string;
  review_avg: number | null;
  review_count: number;
  popular_sort_order: number;
  company: { id: string; name: string; slug: string; logo_url: string | null };
  destination: {
    id: string;
    code: string;
    name: string;
    short_name: string | null;
    slug: string;
    type: string;
  } | null;
  amenities: { amenity_code: string }[];
};

/** Ponto/terminal de um destino, leve (pro autocomplete). */
export type DestinationPointLite = {
  id: string;
  destination_id: string;
  name: string;
  type: string;
  sort_order: number;
};

export const searchKeys = {
  all: ["search"] as const,
  destinations: () => [...searchKeys.all, "destinations"] as const,
  destinationPoints: () => [...searchKeys.all, "destination-points"] as const,
  popularDestinations: () => [...searchKeys.all, "popular-destinations"] as const,
  popularLocations: () => [...searchKeys.all, "popular-locations"] as const,
  parkingTypeCatalog: () => [...searchKeys.all, "parking-type-catalog"] as const,
};

/**
 * Catálogo completo de destinos pra autocomplete.
 * Pequeno (~20 linhas), tolerável carregar todo de uma vez.
 */
export function useDestinations() {
  return useQuery({
    queryKey: searchKeys.destinations(),
    queryFn: async (): Promise<Destination[]> => {
      const { data, error } = await supabase
        .from("destination")
        .select(
          "id, code, name, short_name, slug, type, city, state, country, latitude, longitude, is_popular, sort_order",
        )
        .eq("is_published", true)
        .order("sort_order");
      if (error) throw error;
      return ((data ?? []) as unknown as Destination[]).map((d) => ({
        ...d,
        latitude: Number(d.latitude),
        longitude: Number(d.longitude),
      }));
    },
    staleTime: 5 * 60_000,
  });
}

/** Terminais/pontos de todos os destinos (autocomplete por terminal — E2.1.2). Leitura pública. */
export function useAllDestinationPoints() {
  return useQuery({
    queryKey: searchKeys.destinationPoints(),
    queryFn: async (): Promise<DestinationPointLite[]> => {
      const { data, error } = await supabase
        .from("destination_point")
        .select("id, destination_id, name, type, sort_order")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as DestinationPointLite[];
    },
    staleTime: 5 * 60_000,
  });
}

export function usePopularDestinations(limit = 8) {
  return useQuery({
    queryKey: [...searchKeys.popularDestinations(), limit],
    queryFn: async (): Promise<Destination[]> => {
      const { data, error } = await supabase
        .from("destination")
        .select(
          "id, code, name, short_name, slug, type, city, state, country, latitude, longitude, is_popular, sort_order",
        )
        .eq("is_published", true)
        .eq("is_popular", true)
        .order("sort_order")
        .limit(limit);
      if (error) throw error;
      return ((data ?? []) as unknown as Destination[]).map((d) => ({
        ...d,
        latitude: Number(d.latitude),
        longitude: Number(d.longitude),
      }));
    },
    staleTime: 5 * 60_000,
  });
}

const POPULAR_LOCATION_SELECT = `
  id, name, slug, review_avg, review_count, popular_sort_order,
  company:company_id (id, name, slug, logo_url),
  destination:destination_id (id, code, name, short_name, slug, type),
  amenities:location_amenity (amenity_code)
`;

export function usePopularLocations(limit = 5) {
  return useQuery({
    queryKey: [...searchKeys.popularLocations(), limit],
    queryFn: async (): Promise<PopularLocation[]> => {
      // Tenta curadoria editorial primeiro
      const { data: curated, error } = await supabase
        .from("location")
        .select(POPULAR_LOCATION_SELECT)
        .eq("is_popular", true)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("popular_sort_order")
        .limit(limit);
      if (error) throw error;
      if (curated && curated.length > 0) return curated as unknown as PopularLocation[];

      // Fallback: locations ativas com mais avaliações enquanto curadoria não é configurada
      const { data: fallback, error: fallbackError } = await supabase
        .from("location")
        .select(POPULAR_LOCATION_SELECT)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("review_count", { ascending: false })
        .limit(limit);
      if (fallbackError) throw fallbackError;
      return (fallback ?? []) as unknown as PopularLocation[];
    },
    staleTime: 5 * 60_000,
  });
}

// --- Popular Offers (home page com preço) ---

export type PopularOffer = {
  id: string;
  parking_type: { code: string; name: string };
  location: {
    id: string;
    name: string;
    slug: string;
    review_avg: number | null;
    review_count: number;
    /** Posição no ranking de reservas (0 = mais reservado). Vem da RPC popular_locations. */
    rank: number;
    cover_image: string | null;
    company: { id: string; name: string; slug: string };
    destination: {
      id: string;
      code: string;
      name: string;
      short_name: string | null;
      slug: string;
    } | null;
    amenities: { amenity_code: string }[];
  };
  /** Preço de partida: 1 diária, ou a menor estadia que o lote vende (ver `price_days`). */
  price_from: number | null;
  old_price_from: number | null;
  /** Diárias que `price_from` cobre. Maior que 1 quando o lote exige estadia mínima. */
  price_days: number;
};

/**
 * Teto de 1 card por EMPRESA, guardando o tipo de vaga MAIS VENDIDO daquela empresa (o de menor
 * `rank`, que vem da RPC popular_parking_types já ordenada por venda). Ordena pelo rank e corta em
 * `max`. Mais restritivo que a busca de propósito: a home é vitrine curta de destaques, não lista
 * exaustiva, então uma empresa não pode ocupar vários slots (86ajnfwgx). Pura → testável sem rede.
 */
export function dedupePopularOffers(offers: PopularOffer[], max: number): PopularOffer[] {
  const byCompany = new Map<string, PopularOffer>();
  for (const o of offers) {
    // Empresa ausente acontece de verdade: a RLS do catálogo só libera `company` ativa, e há
    // unidade listada cuja empresa não está. Antes disso a leitura de `company.id` estourava e
    // levava a home inteira junto, então a linha sai da vitrine em vez de derrubá-la.
    if (!o.location.company?.id) continue;
    const cur = byCompany.get(o.location.company.id);
    if (!cur || o.location.rank < cur.location.rank) {
      byCompany.set(o.location.company.id, o);
    }
  }
  return [...byCompany.values()]
    .sort((a, b) => a.location.rank - b.location.rank)
    .slice(0, max);
}

export function usePopularOffers(maxLocations = 6) {
  return useQuery({
    queryKey: [...searchKeys.popularLocations(), "offers", maxLocations],
    queryFn: async (): Promise<PopularOffer[]> => {
      // Passo 1: ranking por venda do TIPO DE VAGA (RPC popular_parking_types, zero-safe). Cada linha
      // é um location_parking_type (o `id`). Buffer 4x porque o teto é 1 por empresa: várias linhas
      // do topo podem ser da mesma empresa (ex.: Aerovalet com 2 unidades), então precisa de mais
      // candidatos pra fechar `maxLocations` empresas distintas. Alguns lotes também caem na dedupe
      // por não ter preço calculável.
      const { data: rankRows, error: rankErr } = await supabase.rpc("popular_parking_types", {
        p_limit: maxLocations * 4,
      });
      if (rankErr) throw rankErr;
      // Quem já vendeu fica na ordem do ranking; a cauda sem venda entra embaralhada por dia,
      // senão as mesmas unidades ficariam na vitrine para sempre por critério de desempate.
      const rankedRows = orderPopularRows(rankRows ?? [], dailySeed(new Date()));
      if (rankedRows.length === 0) return [];

      // rank por lpt (a ordem de venda); as locations a buscar são as das linhas ranqueadas.
      const rankMap = Object.fromEntries(rankedRows.map((r, i) => [r.id, i] as const));
      const locationIds = [...new Set(rankedRows.map((r) => r.location_id))];

      // Passo 2: detalhes das locations (empresa, destino, amenidades)
      // Query separada para evitar nesting profundo que impede pricing_tier de retornar
      const { data: locDetails, error: locErr } = await supabase
        .from("location")
        .select(`
          id, name, slug, review_avg, review_count,
          company:company_id (id, name, slug),
          destination:destination_id (id, code, name, short_name, slug),
          amenities:location_amenity (amenity_code),
          photos
        `)
        .in("id", locationIds);
      if (locErr) throw locErr;

      const locMap = new Map(((locDetails ?? []) as any[]).map((l) => [l.id, l]));

      // Passo 3: ofertas ativas + pricing (nesting raso: lpt → pricing_rule → pricing_tier)
      // Hint !location_parking_type_id necessário: pricing_rule tem 2 FKs para location_parking_type
      // (location_parking_type_id e surcharge_source_id), causando ambiguidade sem o hint.
      const { data: lptRaw, error: lptErr } = await supabase
        .from("location_parking_type")
        .select(`
          id,
          location_id,
          company_parking_type:company_parking_type_id (
            parking_type:parking_type_id (code, name)
          ),
          pricing_rule!location_parking_type_id (
            strategy,
            incremental_one_day_price,
            old_price_strategy, old_price_multiplier,
            hourly_daily_rate,
            pricing_tier (from_day, to_day, total_price, unit_price, is_old_price)
          )
        `)
        .in("location_id", locationIds)
        .eq("is_active", true);
      if (lptErr) throw lptErr;

      const offers: PopularOffer[] = [];
      for (const r of (lptRaw ?? []) as any[]) {
        const loc = locMap.get(r.location_id);
        if (!loc || !r.company_parking_type?.parking_type) continue;
        // A empresa vem null quando a RLS do catálogo não a libera para quem está deslogado
        // (`catalog_read_company` exige company.status e onboarding_status ativos, e há unidades
        // listadas cuja empresa não está). Sem esta guarda a seção inteira caía: o dedupe lê
        // `company.id` e estourava, deixando a home sem os populares para todo visitante anônimo.
        if (!loc.company) continue;
        const ruleRaw = Array.isArray(r.pricing_rule) ? r.pricing_rule[0] : r.pricing_rule;
        // "A partir de": quem só vende estadia longa entra com o preço da menor estadia que
        // vende, em vez de sair da home por não ter preço de 1 diária (que é o normal em lote
        // de aeroporto, e derrubava Abbapark, Nationpark e a coberta do Plenty Park).
        const from = calcFromPrice(ruleRaw ?? null);
        if (!from) continue;

        // Fonte canônica de fotos = coluna location.photos (text[]), a mesma que o operador
        // edita e o detalhe (listing) usa. A 1ª é a capa.
        const photos: string[] = Array.isArray(loc.photos) ? loc.photos : [];
        const primaryPhoto = photos[0] ?? null;

        offers.push({
          id: r.id,
          parking_type: r.company_parking_type.parking_type as { code: string; name: string },
          location: {
            id: loc.id,
            name: loc.name,
            slug: loc.slug,
            review_avg: loc.review_avg ?? null,
            review_count: loc.review_count ?? 0,
            rank: rankMap[r.id] ?? Number.MAX_SAFE_INTEGER,
            cover_image: primaryPhoto,
            company: loc.company as { id: string; name: string; slug: string },
            destination: loc.destination as PopularOffer["location"]["destination"],
            amenities: (loc.amenities ?? []) as { amenity_code: string }[],
          },
          price_from: from.price,
          old_price_from: from.oldPrice,
          price_days: from.days,
        });
      }

      // 1 card por estacionamento (menor preço), ordenado pelo ranking de reservas, top N.
      return dedupePopularOffers(offers, maxLocations);
    },
    staleTime: 5 * 60_000,
  });
}

export function useParkingTypeCatalog() {
  return useQuery({
    queryKey: searchKeys.parkingTypeCatalog(),
    queryFn: async (): Promise<ParkingTypeCatalog[]> => {
      const { data, error } = await supabase
        .from("parking_type")
        .select("id, code, name, description")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ParkingTypeCatalog[];
    },
    staleTime: 5 * 60_000,
  });
}
