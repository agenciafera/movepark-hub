import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  actions: (companyId: string) => [...wlBookingsKeys.all, "actions", companyId] as const,
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

/** O que quem está logado pode fazer nas reservas do site da empresa. A Edge confere de novo. */
export type WlBookingActions = { enabled: boolean; attendance: boolean; license_plate: boolean };

export function useWlBookingActions(companyId: string | undefined) {
  return useQuery({
    queryKey: wlBookingsKeys.actions(companyId ?? ""),
    enabled: !!companyId,
    queryFn: async (): Promise<WlBookingActions> => {
      const { data, error } = await rpc("wl_booking_my_actions", { p_company_id: companyId });
      if (error) throw new Error(error.message);
      const d = (data ?? {}) as Partial<WlBookingActions>;
      return { enabled: d.enabled === true, attendance: d.attendance === true, license_plate: d.license_plate === true };
    },
  });
}

export type WlBookingActionInput =
  | { action: "attendance"; wlBookingId: string; status: "pendente" | "compareceu" | "no_show" }
  | {
      action: "license_plate";
      wlBookingId: string;
      licensePlate: string;
      reason: string;
      brand?: string;
      model?: string;
      color?: string;
    };

/**
 * Marca comparecimento ou troca a placa de uma reserva do site, pela Edge `wl-booking-action`, que
 * confere a permissão e grava no site do parceiro. A mensagem de erro já vem pronta para a tela.
 */
export function useWlBookingAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: WlBookingActionInput) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Faça login de novo.");
      const body =
        args.action === "attendance"
          ? { action: "attendance", wl_booking_id: args.wlBookingId, status: args.status }
          : {
              action: "license_plate",
              wl_booking_id: args.wlBookingId,
              license_plate: args.licensePlate,
              reason: args.reason,
              brand: args.brand,
              model: args.model,
              color: args.color,
            };
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wl-booking-action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Não deu para concluir (HTTP ${res.status}).`);
      return json as Record<string, unknown>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: wlBookingsKeys.all }),
  });
}
