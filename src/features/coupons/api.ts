import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Coupon, CouponWithRestrictions } from "@/types/domain";
import type { CouponUpsertArgs } from "./coupons.logic";

export const couponsKeys = {
  all: ["coupons"] as const,
  list: (companyId: string) => [...couponsKeys.all, "list", companyId] as const,
  parkingTypes: (companyId: string) => [...couponsKeys.all, "parking-types", companyId] as const,
};

export type CompanyParkingTypeOption = { id: string; name: string };

/** Tipos de vaga da empresa (para restringir o cupom). */
export function useCompanyParkingTypes(companyId: string | undefined) {
  return useQuery({
    queryKey: companyId
      ? couponsKeys.parkingTypes(companyId)
      : [...couponsKeys.all, "parking-types", "none"],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CompanyParkingTypeOption[]> => {
      const { data, error } = await supabase
        .from("company_parking_type")
        .select("id, parking_type:parking_type!inner(name)")
        .eq("company_id", companyId!)
        .is("deleted_at", null);
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      return (data ?? []).map((r: any) => ({ id: r.id, name: r.parking_type.name }));
    },
  });
}

/** Catálogo de cupons da empresa (inclui inativos — RLS de operator) + restrições. */
export function useCompanyCoupons(companyId: string | undefined) {
  return useQuery({
    queryKey: companyId ? couponsKeys.list(companyId) : [...couponsKeys.all, "list", "none"],
    enabled: !!companyId,
    queryFn: async (): Promise<CouponWithRestrictions[]> => {
      const { data: coupons, error } = await supabase
        .from("coupon")
        .select("*")
        .eq("company_id", companyId!)
        .order("sort_order", { ascending: true })
        .order("code", { ascending: true });
      if (error) throw error;

      const list = (coupons ?? []) as Coupon[];
      if (list.length === 0) return [];

      const { data: restrictions, error: rErr } = await supabase
        .from("coupon_parking_type")
        .select("coupon_id, company_parking_type_id")
        .in(
          "coupon_id",
          list.map((c) => c.id),
        );
      if (rErr) throw rErr;

      const byCoupon = new Map<string, string[]>();
      for (const row of restrictions ?? []) {
        const arr = byCoupon.get(row.coupon_id) ?? [];
        arr.push(row.company_parking_type_id);
        byCoupon.set(row.coupon_id, arr);
      }

      return list.map((c) => ({ ...c, parking_type_ids: byCoupon.get(c.id) ?? [] }));
    },
  });
}

function useCouponInvalidate(companyId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: couponsKeys.all });
    if (companyId) qc.invalidateQueries({ queryKey: couponsKeys.list(companyId) });
  };
}

/** Cria/edita um cupom (RPC SECURITY DEFINER). */
export function useUpsertCoupon(companyId: string | undefined) {
  const invalidate = useCouponInvalidate(companyId);
  return useMutation({
    mutationFn: async (args: CouponUpsertArgs): Promise<string> => {
      // params da RPC aceitam null (default no SQL); o type gen do Supabase não reflete isso.
      const { data, error } = await supabase.rpc("operator_upsert_coupon", args as never);
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: invalidate,
  });
}

/** Ativa/desativa rápido (RPC SECURITY DEFINER). */
export function useSetCouponActive(companyId: string | undefined) {
  const invalidate = useCouponInvalidate(companyId);
  return useMutation({
    mutationFn: async (args: { id: string; is_active: boolean }): Promise<void> => {
      const { error } = await supabase.rpc("operator_set_coupon_active", {
        p_coupon_id: args.id,
        p_is_active: args.is_active,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

/** Exclui um cupom (bloqueado pela RPC se já usado em reserva). */
export function useDeleteCoupon(companyId: string | undefined) {
  const invalidate = useCouponInvalidate(companyId);
  return useMutation({
    mutationFn: async (couponId: string): Promise<void> => {
      const { error } = await supabase.rpc("operator_delete_coupon", { p_coupon_id: couponId });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}
