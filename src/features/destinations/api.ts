import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";
import type { Destination } from "@/types/domain";

type DestinationInsert = Database["public"]["Tables"]["destination"]["Insert"];
type DestinationUpdate = Database["public"]["Tables"]["destination"]["Update"];

export const destinationsKeys = {
  all: ["destinations"] as const,
  adminList: () => [...destinationsKeys.all, "admin"] as const,
  detail: (slug: string) => [...destinationsKeys.all, "detail", slug] as const,
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
