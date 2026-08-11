import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";
import type { Destination, DestinationPoint, ProspectCard } from "@/types/domain";

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
 * `formatDistance` receber número, e não "1.01".
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
    amenities: Array.isArray(row.amenities) ? (row.amenities as string[]) : [],
  })) as ProspectCard[];
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
      const { data, error } = await supabase
        .from("destination")
        .select("*")
        .order("sort_order");
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

/** Pontos (terminais/píeres) de um destino, ordenados. Leitura pública. */
export function useDestinationPoints(destinationId: string | undefined) {
  return useQuery({
    queryKey: destinationId
      ? destinationsKeys.points(destinationId)
      : [...destinationsKeys.all, "points", "none"],
    enabled: !!destinationId,
    queryFn: async (): Promise<DestinationPoint[]> => {
      const { data, error } = await supabase
        .from("destination_point")
        .select("*")
        .eq("destination_id", destinationId!)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as DestinationPoint[];
    },
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
