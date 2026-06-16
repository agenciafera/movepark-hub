import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";
import type { Destination, DestinationPoint } from "@/types/domain";

type DestinationInsert = Database["public"]["Tables"]["destination"]["Insert"];
type DestinationUpdate = Database["public"]["Tables"]["destination"]["Update"];
type DestinationPointInsert = Database["public"]["Tables"]["destination_point"]["Insert"];
type DestinationPointUpdate = Database["public"]["Tables"]["destination_point"]["Update"];

export const destinationsKeys = {
  all: ["destinations"] as const,
  adminList: () => [...destinationsKeys.all, "admin"] as const,
  detail: (slug: string) => [...destinationsKeys.all, "detail", slug] as const,
  points: (destinationId: string) => [...destinationsKeys.all, "points", destinationId] as const,
};

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
