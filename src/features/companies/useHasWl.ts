import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/context";
import { anyCompanyHasWl } from "./hasWl.logic";

/**
 * O painel em foco tem white-label? Regra única do front (reservas-unificadas-hub-wl.md § 2).
 *
 * - hub_admin sem estar dentro de um parceiro (Manager): sim, ele vê a rede inteira.
 * - Parceiro, ou admin dentro de um parceiro: sim só se a empresa em foco tem `wl_domain`.
 *
 * Todo elemento ligado ao white-label passa por aqui. O servidor confere a mesma regra
 * (`company_has_wl`), então esconder na tela nunca é a única barreira.
 */
export function useHasWl(): { hasWl: boolean; isLoading: boolean } {
  const { session, impersonatedCompanyId, effectiveCompanyIds } = useAuth();
  const networkView = session?.role === "hub_admin" && !impersonatedCompanyId;
  const ids = impersonatedCompanyId ? [impersonatedCompanyId] : effectiveCompanyIds;

  const q = useQuery({
    queryKey: ["companies", "has-wl", ids],
    enabled: !networkView && ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("company").select("id, wl_domain").in("id", ids);
      if (error) throw error;
      return anyCompanyHasWl(data ?? []);
    },
  });

  if (networkView) return { hasWl: true, isLoading: false };
  if (ids.length === 0) return { hasWl: false, isLoading: false };
  return { hasWl: q.data === true, isLoading: q.isLoading };
}
