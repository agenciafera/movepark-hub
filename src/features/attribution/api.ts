import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { BookingAttribution, ExternalExitClickRow } from "@/types/domain";

export const attributionKeys = {
  all: ["attribution"] as const,
  range: (from: string, to: string, locationIds?: string[]) =>
    [...attributionKeys.all, from, to, locationIds] as const,
  exitClicks: (from: string, to: string, locationIds?: string[]) =>
    [...attributionKeys.all, "exit-clicks", from, to, locationIds] as const,
};

/**
 * Atribuição de reservas por origem (hub × white-label) e UTM num período (E2.4.1),
 * com recorte opcional por unidade. Via RPC `booking_attribution` (SECURITY DEFINER,
 * só hub_admin). O eixo aqui é `created_at`: atribuição é sobre quando a venda entrou.
 */
export function useBookingAttribution(from: string, to: string, locationIds?: string[]) {
  return useQuery({
    queryKey: attributionKeys.range(from, to, locationIds),
    staleTime: 60_000,
    queryFn: async (): Promise<BookingAttribution> => {
      const { data, error } = await supabase.rpc("booking_attribution", {
        p_from: from,
        p_to: to,
        ...(locationIds?.length ? { p_location_ids: locationIds } : {}),
      });
      if (error) throw error;
      return data as unknown as BookingAttribution;
    },
  });
}

/**
 * Cliques de saída para o site do parceiro num período (E0.16), com o mesmo recorte por unidade
 * da barra de filtros. Via RPC `manager_external_exit_clicks` (SECURITY DEFINER, só hub_admin).
 *
 * É a outra ponta da atribuição: a reserva da unidade externa não nasce no Hub, então o clique é
 * o último ponto que a gente enxerga.
 */
export function useExternalExitClicks(from: string, to: string, locationIds?: string[]) {
  return useQuery({
    queryKey: attributionKeys.exitClicks(from, to, locationIds),
    staleTime: 60_000,
    queryFn: async (): Promise<ExternalExitClickRow[]> => {
      const { data, error } = await supabase.rpc("manager_external_exit_clicks", {
        p_from: from,
        p_to: to,
        ...(locationIds?.length ? { p_location_ids: locationIds } : {}),
      });
      if (error) throw error;
      return (data ?? []) as unknown as ExternalExitClickRow[];
    },
  });
}
