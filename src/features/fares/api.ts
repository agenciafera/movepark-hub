import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { FARE_TIER_ORDER, type FareOption, type FareTier } from "@/lib/fares";

export const faresKeys = {
  all: ["unit-fares"] as const,
  unit: (lptId: string) => [...faresKeys.all, lptId] as const,
  catalog: () => [...faresKeys.all, "__catalog__"] as const,
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

async function fetchUnitFares(lptId: string | null): Promise<FareOption[]> {
  const { data, error } = await supabase.rpc("get_unit_fares", {
    p_location_parking_type_id: lptId ?? undefined,
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

/** Catálogo global de Tarifas (sem unidade) — usado no upgrade pós-reserva. */
export function useFareCatalog() {
  return useQuery({
    queryKey: faresKeys.catalog(),
    queryFn: () => fetchUnitFares(null),
    staleTime: 5 * 60 * 1000,
  });
}

export type FareUpgradeResponse = {
  payment_id: string;
  status: string;
  qr_code: string;
  qr_code_url: string;
  expires_at: string;
  delta: number;
};

/** Cria a cobrança PIX do upgrade de Tarifa (E2.8-d) via Edge create-fare-upgrade. */
export function useCreateFareUpgrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { booking_code: string; target_tier: FareTier }): Promise<FareUpgradeResponse> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente.");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-fare-upgrade`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(args),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Falha (HTTP ${res.status})`);
      return body as FareUpgradeResponse;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking-detail"] }),
  });
}
