import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type AmenityRow = {
  code: string;
  name: string;
  category: "security" | "service" | "access" | "extras" | string;
  icon: string | null;
  sort_order: number;
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

