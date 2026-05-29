import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type AmenityRow = {
  code: string;
  name: string;
  category: "security" | "service" | "access" | "extras" | string;
  icon: string | null;
  sort_order: number;
};

export type CompanyOption = {
  slug: string;
  name: string;
};

/** Catálogo de amenidades agrupado por category. */
export function useAmenityCatalog() {
  return useQuery({
    queryKey: ["amenity-catalog"] as const,
    queryFn: async (): Promise<AmenityRow[]> => {
      const { data, error } = await supabase
        .from("amenity")
        .select("code, name, category, icon, sort_order")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as AmenityRow[];
    },
    staleTime: 5 * 60_000,
  });
}

/** Empresas ativas pra filtro de operador. */
export function useCompanyOptions() {
  return useQuery({
    queryKey: ["company-options"] as const,
    queryFn: async (): Promise<CompanyOption[]> => {
      const { data, error } = await supabase
        .from("company")
        .select("slug, name")
        .eq("status", "active")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CompanyOption[];
    },
    staleTime: 5 * 60_000,
  });
}
