import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { WlBookingRow, WlBookingStatus } from "@/types/domain";

/**
 * Reservas feitas no site white-label do parceiro, para a aba "Pelo seu site" em Reservas.
 *
 * Só leitura, por RPC SECURITY DEFINER com o gate `wl-bookings:read` no servidor (ADR-005); a
 * aba só espelha. A tabela `wl_booking` não tem leitura direta para o parceiro.
 *
 * Spec: docs/specs/reservas-wl-no-hub.md § 9.
 */

export type WlBookingFilters = {
  /** Empresa impersonada pelo admin; o parceiro manda undefined e o servidor recorta. */
  companyId?: string;
  status?: WlBookingStatus;
  search?: string;
  from?: string;
  to?: string;
};

export const wlBookingsKeys = {
  all: ["wl-bookings"] as const,
  list: (f: WlBookingFilters) => [...wlBookingsKeys.all, "list", f] as const,
  count: (companyId?: string) => [...wlBookingsKeys.all, "count", companyId ?? "own"] as const,
};

// As RPCs não estão em `database.ts`: o `supabase gen types` vem derrubando tabelas e funções
// que existem no banco (ver src/features/wl-health/api.ts), e regenerar apagaria os tipos delas.
function rpc(fn: string, args?: Record<string, unknown>) {
  const call = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  return call(fn, args);
}

async function fetchWlBookings(f: WlBookingFilters): Promise<WlBookingRow[]> {
  const { data, error } = await rpc("operator_wl_bookings", {
    p_company_id: f.companyId ?? null,
    p_status: f.status ?? null,
    p_search: f.search ?? null,
    p_from: f.from ?? null,
    p_to: f.to ?? null,
  });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as WlBookingRow[]) : [];
}

export function useWlBookings(filters: WlBookingFilters, enabled = true) {
  return useQuery({
    queryKey: wlBookingsKeys.list(filters),
    queryFn: () => fetchWlBookings(filters),
    enabled,
  });
}

/** Quantas reservas do site existem: a aba só aparece quando há alguma. */
export function useWlBookingsCount(companyId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: wlBookingsKeys.count(companyId),
    enabled,
    queryFn: async (): Promise<number> => {
      const { data, error } = await rpc("operator_wl_bookings_count", {
        p_company_id: companyId ?? null,
      });
      if (error) throw new Error(error.message);
      return typeof data === "number" ? data : Number(data ?? 0);
    },
  });
}
