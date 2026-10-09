import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { bookingsKeys } from "@/features/bookings/api";
import type { WlBookingDetailData } from "@/types/domain";

/**
 * Ações nas reservas feitas no site white-label do parceiro. A leitura saiu daqui em 09/10/2026:
 * as reservas do site entram na lista única de Reservas (`useBookingsPage`, RPC
 * `bookings_list_page`), junto com as do Hub.
 *
 * Specs: docs/specs/reservas-wl-no-hub.md § 10 e reservas-unificadas-hub-wl.md § 3.
 */

export const wlBookingsKeys = {
  all: ["wl-bookings"] as const,
  actions: (companyId: string) => [...wlBookingsKeys.all, "actions", companyId] as const,
  detail: (id: string) => [...wlBookingsKeys.all, "detail", id] as const,
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

/**
 * Uma reserva do site, para a tela de detalhe (reservas-unificadas-hub-wl.md § 4.2). Null quando
 * não existe ou quem chama não enxerga a empresa: o servidor recorta pela mesma regra da lista.
 */
export function useWlBookingDetail(id: string | undefined) {
  return useQuery({
    queryKey: wlBookingsKeys.detail(id ?? ""),
    enabled: !!id,
    queryFn: async (): Promise<WlBookingDetailData | null> => {
      const { data, error } = await rpc("wl_booking_detail", { p_id: id });
      if (error) throw new Error(error.message);
      return (data ?? null) as WlBookingDetailData | null;
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wlBookingsKeys.all });
      qc.invalidateQueries({ queryKey: bookingsKeys.all });
    },
  });
}
