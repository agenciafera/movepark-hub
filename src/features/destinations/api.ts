import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";
import type { Destination, DestinationPoint, ProspectCard } from "@/types/domain";
import type { SearchResultItem } from "@/features/search/useSearchResults";
import {
  buildStaticUnits,
  type ProximityRow,
  type UnitRow,
} from "@/features/destinations/units.logic";
import { fetchGoogleRatings } from "@/features/reviews/googleApi";

type DestinationInsert = Database["public"]["Tables"]["destination"]["Insert"];
type DestinationUpdate = Database["public"]["Tables"]["destination"]["Update"];
type DestinationPointInsert = Database["public"]["Tables"]["destination_point"]["Insert"];
type DestinationPointUpdate = Database["public"]["Tables"]["destination_point"]["Update"];

export const destinationsKeys = {
  all: ["destinations"] as const,
  adminList: () => [...destinationsKeys.all, "admin"] as const,
  detail: (slug: string) => [...destinationsKeys.all, "detail", slug] as const,
  points: (destinationId: string) => [...destinationsKeys.all, "points", destinationId] as const,
  prospects: (slug: string) => [...destinationsKeys.all, "prospects", slug] as const,
};

/**
 * Lotes MAPEADOS de um destino (E0.17-d), a seção de baixo da página.
 *
 * São estacionamentos sem contrato: sem preço, sem disponibilidade, sem caminho de
 * reserva. Por isso não passam pela Edge `search`, que é o pipeline do lado vendável.
 * A RPC é `security invoker`, então o telefone continua fora do alcance (Q-021) e
 * rascunho/ficha convertida continuam invisíveis.
 *
 * Exportada solta (e não só como hook) porque o `loader` da rota a chama no BUILD: o selo
 * "Sem reserva online" precisa estar no HTML pré-renderizado, não só depois do JS, senão
 * o crawler não lê justamente a frase que diz o que aquele card é.
 *
 * `numeric` do Postgres chega como string no PostgREST: o `Number()` é o que faz o
 * `formatDistance` receber número, e não "1.01". Vale igual para `google_rating`, que sem a
 * conversão chegaria "4.4" e quebraria o `formatRating` do selo.
 *
 * A nota do Google sai da própria RPC (§6 de avaliacoes-google.md) porque o front anônimo não
 * consegue ler o `google_place_id` da tabela para buscar o snapshot por conta própria: o grant
 * de coluna do Q-021 cortou o SELECT direto.
 */
export async function fetchDestinationProspects(slug: string): Promise<ProspectCard[]> {
  const { data, error } = await supabase.rpc("destination_prospect_cards", {
    p_destination_slug: slug,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    distance_km: row.distance_km == null ? null : Number(row.distance_km),
    google_rating: row.google_rating == null ? null : Number(row.google_rating),
    google_rating_count: row.google_rating_count ?? 0,
    google_fetched_at: row.google_fetched_at ?? null,
    amenities: Array.isArray(row.amenities) ? (row.amenities as string[]) : [],
  })) as ProspectCard[];
}

/**
 * Unidades VENDÁVEIS ancoradas ao destino, já no formato de card da busca.
 *
 * Existe pelo mesmo motivo do `fetchDestinationProspects` acima, e para o lado de cima da
 * página: o `loader` a chama no BUILD para os cards saírem no HTML pré-renderizado. Antes
 * disso, `dist/destinos/aeroporto-afonso-pena.html` tinha zero links `/p/` e 41 skeletons,
 * porque a lista só existia depois do fetch da Edge `search` no cliente.
 *
 * NÃO chama a Edge `search` de propósito, mesmo ela sendo a dona do formato: a busca precisa
 * de janela de datas, e data escolhida em tempo de build envelhece no primeiro dia. Aqui só
 * entra o que é verdade sem data.
 *
 * Duas leituras, o mesmo desenho que a home já usa (`usePopularOffers`):
 *   1. `location_parking_type` com a tabela de preço aninhada. O hint
 *      `!location_parking_type_id` é obrigatório: `pricing_rule` tem duas FKs para
 *      `location_parking_type` (a própria e `surcharge_source_id`), e sem ele o PostgREST
 *      reclama de ambiguidade.
 *   2. `locations_proximity`, a mesma RPC da Edge, porque distância é PostGIS e nunca conta
 *      no TypeScript (ADR-001).
 *
 * O caminho até o tipo de vaga passa por `company_parking_type`. Não existe FK direta de
 * `location_parking_type` para `parking_type`: tentar embutir direto devolve PGRST200.
 */
export async function fetchDestinationUnits(destination: {
  id: string;
  latitude: number | string | null;
  longitude: number | string | null;
}): Promise<SearchResultItem[]> {
  const { data: rows, error } = await supabase
    .from("location_parking_type")
    .select(
      `
      id, capacity, is_active,
      location:location!inner(
        id, slug, name, address, latitude, longitude,
        review_avg, review_count, google_place_id, photos, is_listed, deleted_at,
        company:company!inner(slug, name, status),
        amenities:location_amenity(amenity_code)
      ),
      company_parking_type:company_parking_type!inner(
        parking_type:parking_type!inner(code, name)
      ),
      pricing_rule!location_parking_type_id(
        strategy, incremental_one_day_price,
        old_price_strategy, old_price_multiplier, hourly_daily_rate,
        pricing_tier(from_day, to_day, total_price, unit_price, is_old_price)
      )
    `,
    )
    .eq("is_active", true)
    .eq("location.destination_id", destination.id)
    .eq("location.is_listed", true)
    .is("location.deleted_at", null);
  if (error) throw error;

  const lat = destination.latitude == null ? null : Number(destination.latitude);
  const lng = destination.longitude == null ? null : Number(destination.longitude);
  // Sem geo do destino não dá para medir distância, e o card simplesmente não mostra a linha.
  const { data: proximity } =
    lat != null && lng != null
      ? await supabase.rpc("locations_proximity", {
          p_lat: lat,
          p_lng: lng,
          p_destination_id: destination.id,
        })
      : { data: [] };

  // Terceira leitura, a nota do Google, uma consulta para a página inteira. Entra aqui e não
  // num hook porque o selo tem que sair no HTML do build (§6 e §8 de avaliacoes-google.md):
  // até então o card pré-renderizado saía sem selo nenhum na unidade sem avaliação Movepark,
  // e só ganhava um depois que a busca do cliente respondia. Falhar aqui não pode custar a
  // lista: sem nota o card volta a ser o de antes.
  const unitRows = (rows ?? []) as unknown as UnitRow[];
  const placeIds = unitRows
    .map((r) => r.location?.google_place_id ?? null)
    .filter((id): id is string => !!id);
  const google = await fetchGoogleRatings(placeIds).catch(() => []);

  return buildStaticUnits(unitRows, (proximity ?? []) as unknown as ProximityRow[], google);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O lote citado no `?lote=` do "Seja parceiro" (E0.17-g), para preencher o formulário.
 *
 * A RLS já filtra: ficha em rascunho ou convertida não volta, e aí o formulário abre em
 * branco, como se ninguém tivesse citado nada. Isso é o certo, porque a referência vem de
 * um parâmetro de URL e não é prova de nada: quem decide se ela vale é a RPC, no banco.
 * O formato é conferido antes de chegar ao PostgREST, senão um `?lote=oi` vira 400.
 */
export function useProspectForClaim(id: string | null) {
  const valido = !!id && UUID_RE.test(id);
  return useQuery({
    queryKey: [...destinationsKeys.all, "claim", id ?? "none"] as const,
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prospect_location")
        .select("id, name, slug, destination:destination(city, state)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

/** Público: os lotes mapeados do destino. Cobre a navegação no cliente; no SSG o loader já traz. */
export function useDestinationProspects(slug: string | undefined) {
  return useQuery({
    queryKey: slug
      ? destinationsKeys.prospects(slug)
      : [...destinationsKeys.all, "prospects", "none"],
    enabled: !!slug,
    queryFn: () => fetchDestinationProspects(slug!),
    staleTime: 5 * 60_000,
  });
}

/** Público: um destino publicado por slug (página /destinos/:slug). */
export function useDestinationBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: slug ? destinationsKeys.detail(slug) : [...destinationsKeys.all, "detail", "none"],
    enabled: !!slug,
    queryFn: async (): Promise<Destination | null> => {
      const { data, error } = await supabase
        .from("destination")
        .select("*")
        .eq("slug", slug!)
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Destination | null;
    },
    staleTime: 5 * 60_000,
  });
}

/** Público: destinos publicados (lista enxuta) — usado p/ cross-links entre destinos. */
export function usePublishedDestinations() {
  return useQuery({
    queryKey: [...destinationsKeys.all, "public-list"] as const,
    queryFn: async (): Promise<Destination[]> => {
      const { data, error } = await supabase
        .from("destination")
        .select("*")
        .eq("is_published", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Destination[];
    },
    staleTime: 5 * 60_000,
  });
}

/** Admin (hub_admin): todos os destinos, inclusive não publicados. */
export function useAdminDestinations() {
  return useQuery({
    queryKey: destinationsKeys.adminList(),
    queryFn: async (): Promise<Destination[]> => {
      const { data, error } = await supabase.from("destination").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as Destination[];
    },
  });
}

export function useCreateDestination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: DestinationInsert) => {
      const { data, error } = await supabase.from("destination").insert(payload).select().single();
      if (error) throw error;
      return data as Destination;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: destinationsKeys.all }),
  });
}

export function useUpdateDestination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: DestinationUpdate }) => {
      const { data, error } = await supabase
        .from("destination")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Destination;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: destinationsKeys.all }),
  });
}

export function useDeleteDestination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("destination").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: destinationsKeys.all }),
  });
}

// ── Pontos do destino (terminais) — DAT-05 ──────────────────────────────────

/**
 * Pontos (terminais/píeres) de um destino, ordenados. Leitura pública.
 *
 * Exportada solta, e não só como hook, porque o `loader` de `/destinos/<slug>` a chama
 * no BUILD: a ficha de abertura declara os terminais, e ela precisa sair no HTML
 * pré-renderizado.
 */
export async function fetchDestinationPoints(destinationId: string): Promise<DestinationPoint[]> {
  const { data, error } = await supabase
    .from("destination_point")
    .select("*")
    .eq("destination_id", destinationId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as DestinationPoint[];
}

export function useDestinationPoints(destinationId: string | undefined) {
  return useQuery({
    queryKey: destinationId
      ? destinationsKeys.points(destinationId)
      : [...destinationsKeys.all, "points", "none"],
    enabled: !!destinationId,
    queryFn: () => fetchDestinationPoints(destinationId!),
  });
}

export function useCreateDestinationPoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: DestinationPointInsert) => {
      const { data, error } = await supabase
        .from("destination_point")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as DestinationPoint;
    },
    onSuccess: (row) =>
      qc.invalidateQueries({ queryKey: destinationsKeys.points(row.destination_id) }),
  });
}

export function useUpdateDestinationPoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: DestinationPointUpdate }) => {
      const { data, error } = await supabase
        .from("destination_point")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as DestinationPoint;
    },
    onSuccess: (row) =>
      qc.invalidateQueries({ queryKey: destinationsKeys.points(row.destination_id) }),
  });
}

export function useDeleteDestinationPoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; destinationId: string }) => {
      const { error } = await supabase.from("destination_point").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: destinationsKeys.points(vars.destinationId) }),
  });
}
