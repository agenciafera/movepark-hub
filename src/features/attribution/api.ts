import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { BookingAttribution } from "@/types/domain";

export const attributionKeys = {
  all: ["attribution"] as const,
  range: (from: string, to: string) => [...attributionKeys.all, from, to] as const,
};

/**
 * Atribuição de reservas por origem (hub × white-label) e UTM num período (E2.4.1).
 * Via RPC `booking_attribution` (SECURITY DEFINER, só hub_admin).
 */
export function useBookingAttribution(from: string, to: string) {
  return useQuery({
    queryKey: attributionKeys.range(from, to),
    staleTime: 60_000,
    queryFn: async (): Promise<BookingAttribution> => {
      const { data, error } = await supabase.rpc("booking_attribution", {
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return data as unknown as BookingAttribution;
    },
  });
}
