import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { GatewayFeeMeasured } from "@/lib/gatewayFees";

export const appSettingsKeys = { all: ["app-settings"] as const };

export function useAppSettings() {
  return useQuery({
    queryKey: appSettingsKeys.all,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.from("app_setting").select("key, value");
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
    },
  });
}

export function useUpdateAppSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entries: Record<string, string>) => {
      const rows = Object.entries(entries).map(([key, value]) => ({ key, value }));
      const { error } = await supabase.from("app_setting").upsert(rows, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: appSettingsKeys.all }),
  });
}

/**
 * Taxa do gateway medida nas vendas (RPC `gateway_fee_measured`, só hub_admin, 23/11/2026):
 * somas por método e parcelas e a antecipação ao mês, para pôr o medido ao lado do contratado.
 */
export function useGatewayFeeMeasured(days = 90) {
  return useQuery({
    queryKey: ["gateway-fee-measured", days] as const,
    queryFn: async (): Promise<GatewayFeeMeasured> => {
      // Mesmo cast de useBookingGatewayTrail: não depende do database.ts gerado.
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: "gateway_fee_measured",
        a: { p_days: number },
      ) => PromiseLike<{ data: GatewayFeeMeasured | null; error: { message: string } | null }>;
      const { data, error } = await rpc("gateway_fee_measured", { p_days: days });
      if (error) throw new Error(error.message);
      return (
        data ?? {
          days,
          rows: [],
          anticipation: { payables: 0, fee_cents: 0, base_cents_month: 0, monthly_bps: null },
        }
      );
    },
  });
}
