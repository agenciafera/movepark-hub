import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Faturamento do site white-label no recorte (reservas-unificadas-hub-wl.md § 6, fase 5).
 *
 * Uma RPC só (`wl_revenue`, migration 20261129130000) para dashboards, Relatórios, Faturamento e
 * Atribuição. Base: o pago no site (`paid_total_price`), a mesma do relatório do legado. Não há
 * comissão: a venda do site não tem comissão no Hub (D4b revista em 09/10/2026). Para quem
 * não tem white-label o servidor devolve zero, e a tela nem chama (`enabled`).
 */
export type WlRevenue = {
  total: { created: number; paid: number; paid_amount: number };
  by_day: { day: string; paid: number; paid_amount: number }[];
  by_company: {
    company_id: string;
    company_name: string;
    created: number;
    paid: number;
    paid_amount: number;
  }[];
};

export type WlRevenueArgs = {
  from: string;
  to: string;
  locationIds?: string[];
  companyIds?: string[];
  dateField?: "check_in_at" | "created_at";
};

export const EMPTY_WL_REVENUE: WlRevenue = {
  total: { created: 0, paid: 0, paid_amount: 0 },
  by_day: [],
  by_company: [],
};

// A RPC não está em `database.ts` (ver src/features/wl-health/api.ts). O cast fica aqui só.
function rpc(fn: string, args: Record<string, unknown>) {
  const call = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  return call(fn, args);
}

/** Números chegam do Postgres como numeric (string no JSON); aqui viram number. */
export function normalizeWlRevenue(raw: unknown): WlRevenue {
  const r = (raw ?? {}) as Partial<Record<keyof WlRevenue, unknown>>;
  const n = (v: unknown) => Number(v ?? 0);
  const t = (r.total ?? {}) as Record<string, unknown>;
  return {
    total: {
      created: n(t.created),
      paid: n(t.paid),
      paid_amount: n(t.paid_amount),
    },
    by_day: ((r.by_day ?? []) as Record<string, unknown>[]).map((d) => ({
      day: String(d.day),
      paid: n(d.paid),
      paid_amount: n(d.paid_amount),
    })),
    by_company: ((r.by_company ?? []) as Record<string, unknown>[]).map((c) => ({
      company_id: String(c.company_id),
      company_name: String(c.company_name ?? ""),
      created: n(c.created),
      paid: n(c.paid),
      paid_amount: n(c.paid_amount),
    })),
  };
}

export function useWlRevenue(args: WlRevenueArgs, enabled = true) {
  return useQuery({
    queryKey: ["finance", "wl-revenue", args] as const,
    enabled,
    queryFn: async (): Promise<WlRevenue> => {
      const { data, error } = await rpc("wl_revenue", {
        p_from: args.from,
        p_to: args.to,
        p_location_ids: args.locationIds?.length ? args.locationIds : null,
        p_company_ids: args.companyIds?.length ? args.companyIds : null,
        p_date_field: args.dateField ?? "check_in_at",
      });
      if (error) throw new Error(error.message);
      return normalizeWlRevenue(data);
    },
  });
}
