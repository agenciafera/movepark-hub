import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { LocationOccupancyRow } from "@/types/domain";

export const occupancyKeys = {
  all: ["occupancy"] as const,
  range: (locationId: string, from: string, to: string) =>
    [...occupancyKeys.all, locationId, from, to] as const,
};

/**
 * Ocupação por data (booked/capacity) das vagas de uma unidade num intervalo.
 * Via RPC `operator_location_occupancy` (SECURITY DEFINER, gateada por empresa).
 */
export function useLocationOccupancy(
  locationId: string | undefined,
  from: string | undefined,
  to: string | undefined,
) {
  return useQuery({
    queryKey: locationId && from && to ? occupancyKeys.range(locationId, from, to) : occupancyKeys.all,
    enabled: !!locationId && !!from && !!to,
    staleTime: 30_000,
    queryFn: async (): Promise<LocationOccupancyRow[]> => {
      const { data, error } = await supabase.rpc("operator_location_occupancy", {
        p_location_id: locationId!,
        p_from: from!,
        p_to: to!,
      });
      if (error) throw error;
      return (data ?? []) as LocationOccupancyRow[];
    },
  });
}

/** Bloqueia/desbloqueia uma data de um tipo de vaga (E1.4.2) — via RPC operator_set_date_blocked. */
export function useSetDateBlocked() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { locationParkingTypeId: string; date: string; blocked: boolean }) => {
      const { error } = await supabase.rpc("operator_set_date_blocked", {
        p_location_parking_type_id: args.locationParkingTypeId,
        p_date: args.date,
        p_blocked: args.blocked,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: occupancyKeys.all }),
  });
}
