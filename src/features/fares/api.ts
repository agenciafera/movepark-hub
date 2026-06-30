import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { FARE_TIER_ORDER, type FareOption, type FareTier } from "@/lib/fares";

export const faresKeys = {
  all: ["unit-fares"] as const,
  unit: (lptId: string) => [...faresKeys.all, lptId] as const,
};

function rowToOption(r: {
  tier: FareTier;
  label: string;
  price_cents: number;
  is_popular: boolean;
  sort_order: number;
  cancel_window_minutes: number | null;
  benefits: unknown;
}): FareOption {
  return {
    tier: r.tier,
    label: r.label,
    price_cents: r.price_cents,
    is_popular: r.is_popular,
    sort_order: r.sort_order,
    cancel_window_minutes: r.cancel_window_minutes,
    benefits: (r.benefits ?? {}) as FareOption["benefits"],
  };
}

async function fetchUnitFares(lptId: string): Promise<FareOption[]> {
  const { data, error } = await supabase.rpc("get_unit_fares", {
    p_location_parking_type_id: lptId,
  });
  if (error) throw error;
  const opts = (data ?? []).map((r) => rowToOption(r as Parameters<typeof rowToOption>[0]));
  // Garante a ordem good-better-best mesmo se o sort_order vier divergente.
  return opts.sort(
    (a, b) => FARE_TIER_ORDER.indexOf(a.tier) - FARE_TIER_ORDER.indexOf(b.tier),
  );
}

/** Tarifas (Básica/Flex/Superflex) disponíveis para uma unidade (E2.8). */
export function useUnitFares(locationParkingTypeId: string | undefined) {
  return useQuery({
    queryKey: faresKeys.unit(locationParkingTypeId ?? ""),
    queryFn: () => fetchUnitFares(locationParkingTypeId!),
    enabled: !!locationParkingTypeId,
    staleTime: 5 * 60 * 1000, // catálogo muda pouco
  });
}
