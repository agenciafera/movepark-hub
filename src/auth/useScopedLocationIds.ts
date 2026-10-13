import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./context";

/**
 * Id que não casa com unidade nenhuma. Os hooks de relatório e do dashboard tratam lista vazia
 * como "sem filtro", então a empresa recortada sem unidade (ou com as unidades ainda chegando)
 * mandaria a consulta sem recorte, e a tela mostraria tudo o que a RLS libera: a rede inteira para
 * o hub_admin, as outras empresas para o operador que tem mais de uma.
 */
export const NO_LOCATION_ID = "00000000-0000-0000-0000-000000000000";

/**
 * IDs de localização para filtrar queries do painel operator.
 * - Admin impersonando, ou operador com mais de uma empresa: localizações da empresa em escopo.
 * - Operador de uma empresa só: undefined (RLS já restringe).
 * - Admin sem impersonar: undefined (vê tudo).
 *
 * Use junto com `.in("location_id", scopedIds)` quando defined.
 */
export function useScopedLocationIds(): {
  ids: string[] | undefined;
  isLoading: boolean;
} {
  const { scopedCompanyId } = useAuth();
  const query = useQuery({
    queryKey: ["scoped-location-ids", scopedCompanyId],
    queryFn: async () => {
      if (!scopedCompanyId) return [] as string[];
      const { data, error } = await supabase
        .from("location")
        .select("id")
        .eq("company_id", scopedCompanyId);
      if (error) throw error;
      return data.map((l) => l.id);
    },
    enabled: !!scopedCompanyId,
  });
  return {
    ids: scopedCompanyId ? (query.data?.length ? query.data : [NO_LOCATION_ID]) : undefined,
    isLoading: !!scopedCompanyId && query.isLoading,
  };
}
