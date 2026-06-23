import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

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

type PricingRuleRaw = {
  strategy: string;
  incremental_one_day_price: number | null;
  old_price_strategy: string;
  old_price_multiplier: number | null;
  hourly_daily_rate: number | null;
  pricing_tier: {
    from_day: number;
    to_day: number | null;
    total_price: number | null;
    unit_price: number | null;
    is_old_price: boolean;
  }[];
};

function calcOneDayPrice(rule: PricingRuleRaw | null): { price: number | null; oldPrice: number | null } {
  if (!rule) return { price: null, oldPrice: null };

  const tiers = rule.pricing_tier ?? [];
  const active = tiers.filter((t) => !t.is_old_price);
  const oldTiers = tiers.filter((t) => t.is_old_price);

  function find1Day(ts: typeof active) {
    return ts.find((t) => t.from_day <= 1 && (t.to_day === null || t.to_day >= 1)) ?? null;
  }

  let price: number | null = null;
  switch (rule.strategy) {
    case "incremental_formula":
      price = rule.incremental_one_day_price;
      break;
    case "uniform_by_duration": {
      const t = find1Day(active);
      price = t ? (t.unit_price ?? 0) : null;
      break;
    }
    case "fixed_bracket": {
      const t = find1Day(active);
      price = t ? (t.total_price ?? t.unit_price ?? null) : null;
      break;
    }
    case "tiered_progressive": {
      const t = active.find((t) => t.from_day <= 1);
      price = t ? (t.unit_price ?? null) : null;
      break;
    }
    case "hourly_capped":
      price = rule.hourly_daily_rate;
      break;
    // surcharge e monthly_remainder omitidos — preço não calculável sem dados extras
  }

  let oldPrice: number | null = null;
  if (price != null) {
    if (rule.old_price_strategy === "multiplier" && rule.old_price_multiplier) {
      oldPrice = price * rule.old_price_multiplier;
    } else if (rule.old_price_strategy === "own_table") {
      const t = find1Day(oldTiers);
      if (t) oldPrice = t.total_price ?? t.unit_price ?? null;
    }
  }

  return { price, oldPrice };
}

export type PopularOffer = {
  id: string;
  parking_type: { code: string; name: string };
  location: {
    id: string;
    name: string;
    slug: string;
    review_avg: number | null;
    review_count: number;
    popular_sort_order: number;
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
  price_1d: number | null;
  old_price_1d: number | null;
};

export function usePopularOffers(maxLocations = 4) {
  return useQuery({
    queryKey: [...searchKeys.popularLocations(), "offers", maxLocations],
    queryFn: async (): Promise<PopularOffer[]> => {
      // Passo 1: IDs das locations populares (curadoria ou fallback por review_count)
      let locRows: { id: string; popular_sort_order: number }[] = [];
      const { data: curated, error: curErr } = await supabase
        .from("location")
        .select("id, popular_sort_order")
        .eq("is_popular", true)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("popular_sort_order")
        .limit(maxLocations);
      if (curErr) throw curErr;

      if (curated && curated.length > 0) {
        locRows = curated as typeof locRows;
      } else {
        const { data: fb, error: fbErr } = await supabase
          .from("location")
          .select("id, popular_sort_order, review_count")
          .eq("status", "active")
          .is("deleted_at", null)
          .order("review_count", { ascending: false })
          .limit(maxLocations);
        if (fbErr) throw fbErr;
        locRows = (fb ?? []) as typeof locRows;
      }

      if (locRows.length === 0) return [];

      const locationIds = locRows.map((l) => l.id);
      const sortMap = Object.fromEntries(locRows.map((l) => [l.id, l.popular_sort_order ?? 0]));

      // Passo 2: detalhes das locations (empresa, destino, amenidades)
      // Query separada para evitar nesting profundo que impede pricing_tier de retornar
      const { data: locDetails, error: locErr } = await supabase
        .from("location")
        .select(`
          id, name, slug, review_avg, review_count,
          company:company_id (id, name, slug),
          destination:destination_id (id, code, name, short_name, slug),
          amenities:location_amenity (amenity_code)
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
        const ruleRaw = Array.isArray(r.pricing_rule) ? r.pricing_rule[0] : r.pricing_rule;
        const { price, oldPrice } = calcOneDayPrice(ruleRaw ?? null);
        if (price == null) continue;

        offers.push({
          id: r.id,
          parking_type: r.company_parking_type.parking_type as { code: string; name: string },
          location: {
            id: loc.id,
            name: loc.name,
            slug: loc.slug,
            review_avg: loc.review_avg ?? null,
            review_count: loc.review_count ?? 0,
            popular_sort_order: sortMap[r.location_id] ?? 0,
            company: loc.company as { id: string; name: string; slug: string },
            destination: loc.destination as PopularOffer["location"]["destination"],
            amenities: (loc.amenities ?? []) as { amenity_code: string }[],
          },
          price_1d: price,
          old_price_1d: oldPrice,
        });
      }

      offers.sort((a, b) => {
        const d = a.location.popular_sort_order - b.location.popular_sort_order;
        return d !== 0 ? d : (a.price_1d ?? 0) - (b.price_1d ?? 0);
      });

      return offers.slice(0, 6);
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
