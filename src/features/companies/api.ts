import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";
import type { Company } from "@/types/domain";

type CompanyInsert = Database["public"]["Tables"]["company"]["Insert"];
type CompanyUpdate = Database["public"]["Tables"]["company"]["Update"];

export const companiesKeys = {
  all: ["companies"] as const,
  list: () => [...companiesKeys.all, "list"] as const,
  detail: (id: string) => [...companiesKeys.all, "detail", id] as const,
};

export function useCompanies() {
  return useQuery({
    queryKey: companiesKeys.list(),
    queryFn: async (): Promise<Company[]> => {
      const { data, error } = await supabase
        .from("company")
        .select("*")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Company[];
    },
  });
}

export function useCompany(id: string | undefined) {
  return useQuery({
    queryKey: id ? companiesKeys.detail(id) : ["companies", "detail", "none"],
    queryFn: async (): Promise<Company | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("company")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Company | null;
    },
    enabled: !!id,
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CompanyInsert) => {
      const { data, error } = await supabase
        .from("company")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as Company;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: companiesKeys.all }),
  });
}

export function useUpdateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: CompanyUpdate }) => {
      const { data, error } = await supabase
        .from("company")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Company;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: companiesKeys.all }),
  });
}

/**
 * Define a comissão da Movepark (take_rate) de uma empresa — server-authoritative.
 * Via RPC `set_company_take_rate` (gate hub_admin, valida 0..10000 bps). Ver ADR-005.
 */
export function useSetCompanyTakeRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId, takeRateBps }: { companyId: string; takeRateBps: number }) => {
      const { data, error } = await supabase.rpc("set_company_take_rate", {
        p_company_id: companyId,
        p_take_rate_bps: takeRateBps,
      });
      if (error) throw error;
      return data as Company;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: companiesKeys.all });
      // O faturamento calcula a comissão com a take_rate real; invalida pra refletir.
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
  });
}
