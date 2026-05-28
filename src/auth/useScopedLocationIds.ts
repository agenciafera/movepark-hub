import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./context";

/**
 * IDs de localização para filtrar queries do painel operator.
 * - Admin impersonando: localizações da empresa-alvo.
 * - Operador real: undefined (RLS já restringe).
 * - Admin sem impersonar: undefined (vê tudo).
 *
 * Use junto com `.in("location_id", scopedIds)` quando defined.
 */
export function useScopedLocationIds(): {
  ids: string[] | undefined;
  isLoading: boolean;
} {
  const { impersonatedCompanyId } = useAuth();
  const query = useQuery({
    queryKey: ["scoped-location-ids", impersonatedCompanyId],
    queryFn: async () => {
      if (!impersonatedCompanyId) return [] as string[];
      const { data, error } = await supabase
        .from("location")
        .select("id")
        .eq("company_id", impersonatedCompanyId);
      if (error) throw error;
      return data.map((l) => l.id);
    },
    enabled: !!impersonatedCompanyId,
  });
  return {
    ids: impersonatedCompanyId ? query.data : undefined,
    isLoading: !!impersonatedCompanyId && query.isLoading,
  };
}
