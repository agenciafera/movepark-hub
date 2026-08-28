import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type SearchSort = "price_asc" | "price_desc" | "distance_asc" | "rating_desc";
export type SearchVehicle = "car" | "motorcycle";

export type SearchFilters = {
  dest?: string;
  /** Terminal/ponto (destination_point id) — ancora a proximidade no terminal (E2.1.2). */
  point?: string;
  from: string;
  to: string;
  vehicle?: SearchVehicle;
  category?: string[];
  operator?: string[];
  /** Filtro multi-destino (códigos). Independe do `dest` (âncora de proximidade). */
  destinations?: string[];
  amenities?: string[];
  max_distance_km?: number;
  min_rating?: number;
  sort?: SearchSort;
  /**
   * "from" é o modo da vitrine (home e `/destinos`), que busca com uma janela fixa em vez
   * de datas escolhidas pelo cliente: quem só vende a partir de N diárias entra com o preço
   * dessa estadia, em vez de sumir da lista. Na `/search` fica o padrão "exact", porque ali
   * as datas são do cliente.
   */
  price_mode?: "exact" | "from";
  limit?: number;
  offset?: number;
};

export type SearchResultItem = {
  id: string;
  operator: { slug: string; name: string };
  location: {
    id: string;
    slug: string;
    /** Caminho da ficha (`/estacionamentos/<destino>/<lote>`), montado no servidor. */
    public_path: string | null;
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    distance_km: number | null;
    /** Terminal mais próximo do destino buscado (PRD-09 · DAT-05). null sem terminais/geo. */
    nearest_terminal: { name: string; distance_km: number } | null;
    review_avg: number | null;
    review_count: number;
    /** Prova social complementar (avaliacoes-google.md §4/§6): preenche o selo do card só
     *  quando não há avaliação Movepark. Nunca entra em ranking/curadoria (ADR pickCardBadge). */
    google_rating: number | null;
    google_rating_count: number;
    /** Capa (1ª foto da galeria). null → card mostra placeholder. */
    cover_image: string | null;
    /** Sinal de demanda honesto (E3.6) — nunca um número, só presença acima do limiar. */
    high_demand_today: boolean;
    /** Transfer com rastreio ao vivo (Go2Park). Fato da unidade, vale também no checkout externo. */
    go2park?: boolean;
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
    /** Diárias que este preço cobre. Na vitrine pode ser maior que a janela buscada. */
    days: number;
  };
  /** Estadia mínima do lote, preenchida só quando o preço veio dela (`price_mode: "from"`). */
  min_stay_days?: number | null;
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
  /** Facetas para a sidebar de filtros (estacionamento/destino presentes no resultado). */
  facets?: {
    operators: { slug: string; name: string; count: number }[];
    destinations: { code: string; name: string; type: string; count: number }[];
  };
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

// O agrupamento por unidade (`groupResultsByLocation`) saiu em 22/07: a busca passou a exibir um
// card por `location_parking_type`, e a Edge já devolve uma linha por tipo. Ver E2.1.3 (86ajmwawc).

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
