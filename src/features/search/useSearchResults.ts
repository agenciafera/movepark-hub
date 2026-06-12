import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type SearchSort = "price_asc" | "price_desc" | "distance_asc" | "rating_desc";
export type SearchVehicle = "car" | "motorcycle";

export type SearchFilters = {
  dest?: string;
  from: string;
  to: string;
  vehicle?: SearchVehicle;
  category?: string[];
  operator?: string[];
  amenities?: string[];
  max_distance_km?: number;
  min_rating?: number;
  sort?: SearchSort;
  limit?: number;
  offset?: number;
};

export type SearchResultItem = {
  id: string;
  operator: { slug: string; name: string };
  location: {
    id: string;
    slug: string;
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    distance_km: number | null;
    /** Terminal mais próximo do destino buscado (PRD-09 · DAT-05). null sem terminais/geo. */
    nearest_terminal: { name: string; distance_km: number } | null;
    review_avg: number | null;
    review_count: number;
  };
  parking_type: { code: string; name: string };
  capacity: number;
  availability: {
    remaining: number | null;
    sold_out: boolean;
    near_capacity: boolean;
    near_capacity_message: string | null;
  };
  price: {
    total: number;
    old_price: number | null;
    per_day: number;
    days: number;
  };
  amenities: string[];
};

export type SearchResponse = {
  destination: {
    code?: string;
    name?: string;
    latitude: number;
    longitude: number;
  } | null;
  days: number;
  total: number;
  limit: number;
  offset: number;
  results: SearchResultItem[];
};

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function callSearch(filters: SearchFilters): Promise<SearchResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: ANON,
    Authorization: `Bearer ${session?.access_token ?? ANON}`,
  };
  const res = await fetch(FN_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(filters),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Search falhou (HTTP ${res.status})`);
  }
  return res.json();
}

export const searchResultsKey = (f: SearchFilters) =>
  ["search-results", f] as const;

export function useSearchResults(filters: SearchFilters | null) {
  return useQuery({
    queryKey: filters ? searchResultsKey(filters) : ["search-results", "idle"],
    queryFn: () => callSearch(filters!),
    enabled: !!filters && !!filters.from && !!filters.to,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
