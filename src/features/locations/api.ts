import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";
import type { Location } from "@/types/domain";

type LocationInsert = Database["public"]["Tables"]["location"]["Insert"];
type LocationUpdate = Database["public"]["Tables"]["location"]["Update"];

export const locationsKeys = {
  all: ["locations"] as const,
  byCompany: (companyId: string) => [...locationsKeys.all, "company", companyId] as const,
  detail: (id: string) => [...locationsKeys.all, "detail", id] as const,
  forOperator: () => [...locationsKeys.all, "operator"] as const,
};

export function useLocationsByCompany(companyId: string | undefined) {
  return useQuery({
    queryKey: companyId ? locationsKeys.byCompany(companyId) : ["locations", "company", "none"],
    queryFn: async (): Promise<Location[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("location")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Location[];
    },
    enabled: !!companyId,
  });
}

export function useOperatorLocations(filterCompanyId?: string | null) {
  return useQuery({
    queryKey: [...locationsKeys.forOperator(), filterCompanyId ?? "all"] as const,
    queryFn: async (): Promise<(Location & { company: { id: string; name: string } | null })[]> => {
      let q = supabase
        .from("location")
        .select("*, company:company(id, name)")
        .is("deleted_at", null)
        .order("name");
      if (filterCompanyId) q = q.eq("company_id", filterCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as (Location & {
        company: { id: string; name: string } | null;
      })[];
    },
  });
}

export function useLocation(id: string | undefined) {
  return useQuery({
    queryKey: id ? locationsKeys.detail(id) : ["locations", "detail", "none"],
    queryFn: async (): Promise<Location | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("location")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Location | null;
    },
    enabled: !!id,
  });
}

export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LocationInsert) => {
      const { data, error } = await supabase.from("location").insert(payload).select().single();
      if (error) throw error;
      return data as Location;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: locationsKeys.all }),
  });
}

export function useUpdateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: LocationUpdate }) => {
      const { data, error } = await supabase
        .from("location")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Location;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: locationsKeys.all }),
  });
}
