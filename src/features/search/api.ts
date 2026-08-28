import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { calcFromPrice } from "./fromPrice";

export type Destination = {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  slug: string;
  /** Slug da URL pública (`/estacionamentos/<public_slug>`). */
  public_slug: string | null;
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
  parkingTypeCatalog: () => [...searchKeys.all, "parking-type-catalog"] as const,
  featuredOffers: () => [...searchKeys.all, "featured-offers"] as const,
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
          "id, code, name, short_name, slug, public_slug, type, city, state, country, latitude, longitude, is_popular, sort_order",
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
          "id, code, name, short_name, slug, public_slug, type, city, state, country, latitude, longitude, is_popular, sort_order",
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

// --- Vitrine da home (curada no Manager) ---

export type FeaturedOffer = {
  id: string;
  parking_type: { code: string; name: string };
  location: {
    id: string;
    name: string;
    slug: string;
    /** Caminho da ficha, montado no banco pela mesma função que a busca usa. */
    public_path: string | null;
    /** Nome canônico da ficha ("{marca} - Estacionamento {destino}"). */
    public_name: string | null;
    review_avg: number | null;
    review_count: number;
    /** Posição definida na curadoria (`home_featured_offer.sort_order`). Menor aparece antes. */
    sort_order: number;
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
    /** Transfer com rastreio ao vivo (Go2Park): fato da unidade, vale também no checkout externo. */
    go2park: boolean;
  };
  /** Preço de partida: 1 diária, ou a menor estadia que o lote vende (ver `price_days`). */
  price_from: number | null;
  old_price_from: number | null;
  /** Diárias que `price_from` cobre. Maior que 1 quando o lote exige estadia mínima. */
  price_days: number;
};

/**
 * Vitrine da home: a lista que alguém montou em /manager/destaques, na ordem em que montou.
 *
 * Substituiu o ranking por venda (RPC `popular_parking_types`), que media `booking` do Hub num
 * catálogo onde toda unidade de empresa ativa é de checkout externo: o contador delas nasce zero
 * e fica zero, então o ranking só sabia ordenar quem já saiu do ar. Junto saíram o embaralhamento
 * por semente do dia e os tetos de 1 por empresa e 1 por destino, que existiam para conter um
 * ranking que ninguém controlava. Com curadoria, quem decide a composição é quem edita a lista.
 *
 * A RPC já devolve só o que é publicável (mesmo predicado das RLS de catálogo), então a home passa
 * a mostrar o mesmo conjunto para visitante e para hub_admin. Antes não: o admin enxerga a
 * `company` inteira pela policy `company_select`, e via na vitrine unidade de empresa inativa que
 * o anônimo não via.
 *
 * O filtro de empresa continua repetido aqui, como na Edge `search`, porque as consultas 2 e 3
 * passam pelo PostgREST com a RLS de quem está logado: defesa que depende do papel do leitor não é
 * defesa.
 */
export function useFeaturedOffers() {
  return useQuery({
    queryKey: searchKeys.featuredOffers(),
    queryFn: async (): Promise<FeaturedOffer[]> => {
      // Passo 1: a curadoria, já ordenada e já filtrada pelo gate de publicação.
      const { data: curadoria, error: curadoriaErr } = await supabase.rpc("home_featured_offers");
      if (curadoriaErr) throw curadoriaErr;
      const linhas = curadoria ?? [];
      if (linhas.length === 0) return [];

      const ordem = new Map(linhas.map((r) => [r.id, r.sort_order]));
      const caminhos = new Map(linhas.map((r) => [r.id, r.public_path]));
      const locationIds = [...new Set(linhas.map((r) => r.location_id))];

      // Passo 2: detalhes das locations (empresa, destino, amenidades).
      // Query separada para evitar nesting profundo que impede pricing_tier de retornar.
      const { data: locDetails, error: locErr } = await supabase
        .from("location")
        .select(
          `
          id, name, slug, public_name, review_avg, review_count,
          company:company_id (id, name, slug, status),
          destination:destination_id (id, code, name, short_name, slug),
          amenities:location_amenity (amenity_code),
          photos, go2park_enabled
        `,
        )
        .in("id", locationIds);
      if (locErr) throw locErr;

      const locMap = new Map(((locDetails ?? []) as any[]).map((l) => [l.id, l]));

      // Passo 3: pricing dos tipos de vaga curados (nesting raso: lpt → pricing_rule → tier).
      // Hint !location_parking_type_id necessário: pricing_rule tem 2 FKs para
      // location_parking_type (location_parking_type_id e surcharge_source_id), causando
      // ambiguidade sem o hint.
      const { data: lptRaw, error: lptErr } = await supabase
        .from("location_parking_type")
        .select(
          `
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
        `,
        )
        .in("id", [...ordem.keys()]);
      if (lptErr) throw lptErr;

      const offers: FeaturedOffer[] = [];
      for (const r of (lptRaw ?? []) as any[]) {
        const loc = locMap.get(r.location_id);
        if (!loc || !r.company_parking_type?.parking_type) continue;
        if (!loc.company || loc.company.status !== "active") continue;
        const ruleRaw = Array.isArray(r.pricing_rule) ? r.pricing_rule[0] : r.pricing_rule;
        // "A partir de": quem só vende estadia longa entra com o preço da menor estadia que
        // vende, em vez de sair da home por não ter preço de 1 diária (que é o normal em lote
        // de aeroporto, e derrubava Abbapark, Nationpark e a coberta do Plenty Park).
        const from = calcFromPrice(ruleRaw ?? null);
        if (!from) continue;

        // Fonte canônica de fotos = coluna location.photos (text[]), a mesma que o operador
        // edita e o detalhe (listing) usa. A 1ª é a capa.
        const photos: string[] = Array.isArray(loc.photos) ? loc.photos : [];

        offers.push({
          id: r.id,
          parking_type: r.company_parking_type.parking_type as { code: string; name: string },
          location: {
            id: loc.id,
            name: loc.name,
            slug: loc.slug,
            public_path: caminhos.get(r.id) ?? null,
            public_name: loc.public_name ?? null,
            review_avg: loc.review_avg ?? null,
            review_count: loc.review_count ?? 0,
            sort_order: ordem.get(r.id) ?? Number.MAX_SAFE_INTEGER,
            cover_image: photos[0] ?? null,
            company: loc.company as { id: string; name: string; slug: string },
            destination: loc.destination as FeaturedOffer["location"]["destination"],
            amenities: (loc.amenities ?? []) as { amenity_code: string }[],
            go2park: loc.go2park_enabled === true,
          },
          price_from: from.price,
          old_price_from: from.oldPrice,
          price_days: from.days,
        });
      }

      // O PostgREST devolve na ordem dele; a ordem que vale é a da curadoria.
      return offers.sort((a, b) => a.location.sort_order - b.location.sort_order);
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
