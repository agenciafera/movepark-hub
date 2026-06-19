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

export const searchKeys = {
  all: ["search"] as const,
  destinations: () => [...searchKeys.all, "destinations"] as const,
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

export function usePopularLocations(limit = 5) {
  return useQuery({
    queryKey: [...searchKeys.popularLocations(), limit],
    queryFn: async (): Promise<PopularLocation[]> => {
      const { data, error } = await supabase
        .from("location")
        .select(
          `id, name, slug, review_avg, review_count, popular_sort_order,
           company:company_id (id, name, slug, logo_url),
           destination:destination_id (id, code, name, short_name, slug, type),
           amenities:location_amenity (amenity_code)`,
        )
        .eq("is_popular", true)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("popular_sort_order")
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as PopularLocation[];
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
