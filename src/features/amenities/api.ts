import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { locationsKeys } from "@/features/locations/api";

/** Uma comodidade do catálogo. O catálogo é da Movepark: o parceiro só escolhe quais valem. */
export type Amenity = {
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  category: string;
  sort_order: number | null;
};

export const amenitiesKeys = {
  all: ["amenities"] as const,
  catalog: () => [...amenitiesKeys.all, "catalog"] as const,
  ofLocation: (locationId: string) => [...amenitiesKeys.all, "location", locationId] as const,
};

/** Rótulo de cada grupo do catálogo. A coluna `category` guarda o código em inglês. */
export const CATEGORY_LABEL: Record<string, string> = {
  security: "Segurança",
  service: "Serviço",
  access: "Acesso",
  extras: "Extras",
};

/** Ordem de exibição dos grupos, do que mais pesa na decisão para o que menos pesa. */
export const CATEGORY_ORDER = ["security", "service", "access", "extras"];

export function useAmenityCatalog() {
  return useQuery({
    queryKey: amenitiesKeys.catalog(),
    queryFn: async (): Promise<Amenity[]> => {
      const { data, error } = await supabase
        .from("amenity")
        .select("code, name, description, icon, category, sort_order")
        .order("category")
        .order("sort_order", { nullsFirst: false })
        .order("code");
      if (error) throw error;
      return (data ?? []) as Amenity[];
    },
    // Catálogo muda raramente e é igual pra todo mundo.
    staleTime: 10 * 60_000,
  });
}

export function useLocationAmenities(locationId: string | undefined) {
  return useQuery({
    queryKey: locationId ? amenitiesKeys.ofLocation(locationId) : ["amenities", "location", "none"],
    queryFn: async (): Promise<string[]> => {
      if (!locationId) return [];
      const { data, error } = await supabase
        .from("location_amenity")
        .select("amenity_code")
        .eq("location_id", locationId);
      if (error) throw error;
      return (data ?? []).map((r) => r.amenity_code);
    },
    enabled: !!locationId,
  });
}

export function useSetLocationAmenities() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ locationId, codes }: { locationId: string; codes: string[] }) => {
      const { error } = await supabase.rpc("operator_set_location_amenities", {
        p_location_id: locationId,
        p_codes: codes,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { locationId }) => {
      qc.invalidateQueries({ queryKey: amenitiesKeys.ofLocation(locationId) });
      // A busca e o detalhe exibem os benefícios a partir da unidade.
      qc.invalidateQueries({ queryKey: locationsKeys.all });
    },
  });
}
