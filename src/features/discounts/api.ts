import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { DiscountRule, DiscountRuleWithRestrictions } from "@/types/domain";
import type { DiscountUpsertArgs } from "./discounts.logic";

export const discountsKeys = {
  all: ["discounts"] as const,
  list: (companyId: string) => [...discountsKeys.all, "list", companyId] as const,
};

/** Catálogo de descontos da empresa (inclui inativos — RLS de operator) + restrições. */
export function useCompanyDiscounts(companyId: string | undefined) {
  return useQuery({
    queryKey: companyId ? discountsKeys.list(companyId) : [...discountsKeys.all, "list", "none"],
    enabled: !!companyId,
    queryFn: async (): Promise<DiscountRuleWithRestrictions[]> => {
      const { data: rules, error } = await supabase
        .from("discount_rule")
        .select("*")
        .eq("company_id", companyId!)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;

      const list = (rules ?? []) as DiscountRule[];
      if (list.length === 0) return [];

      const { data: restrictions, error: rErr } = await supabase
        .from("discount_rule_parking_type")
        .select("discount_rule_id, company_parking_type_id")
        .in(
          "discount_rule_id",
          list.map((r) => r.id),
        );
      if (rErr) throw rErr;

      const byRule = new Map<string, string[]>();
      for (const row of restrictions ?? []) {
        const arr = byRule.get(row.discount_rule_id) ?? [];
        arr.push(row.company_parking_type_id);
        byRule.set(row.discount_rule_id, arr);
      }

      return list.map((r) => ({ ...r, parking_type_ids: byRule.get(r.id) ?? [] }));
    },
  });
}

function useDiscountInvalidate(companyId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: discountsKeys.all });
    if (companyId) qc.invalidateQueries({ queryKey: discountsKeys.list(companyId) });
  };
}

/** Cria/edita uma regra de desconto (RPC SECURITY DEFINER). */
export function useUpsertDiscount(companyId: string | undefined) {
  const invalidate = useDiscountInvalidate(companyId);
  return useMutation({
    mutationFn: async (args: DiscountUpsertArgs): Promise<string> => {
      // params da RPC aceitam null (default no SQL); o type gen do Supabase não reflete isso.
      const { data, error } = await supabase.rpc("operator_upsert_discount", args as never);
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: invalidate,
  });
}

/** Ativa/desativa rápido (RPC SECURITY DEFINER). */
export function useSetDiscountActive(companyId: string | undefined) {
  const invalidate = useDiscountInvalidate(companyId);
  return useMutation({
    mutationFn: async (args: { id: string; is_active: boolean }): Promise<void> => {
      const { error } = await supabase.rpc("operator_set_discount_active", {
        p_discount_rule_id: args.id,
        p_is_active: args.is_active,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

/** Exclui uma regra (bloqueada pela RPC se já aplicada em reserva). */
export function useDeleteDiscount(companyId: string | undefined) {
  const invalidate = useDiscountInvalidate(companyId);
  return useMutation({
    mutationFn: async (discountRuleId: string): Promise<void> => {
      const { error } = await supabase.rpc("operator_delete_discount", {
        p_discount_rule_id: discountRuleId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}
