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

export interface WlCatalog {
  ready: boolean;
  categories: { slug: string; name: string }[];
  products: { slug: string; name: string; category_slug: string }[];
}

/**
 * Catálogo do WL (categorias + produtos) pra montar os dropdowns do mapeamento no Manager.
 * Best-effort: se o WL ainda não expõe os endpoints de listagem, volta ready=false e o
 * Manager cai no input de texto livre.
 */
export function useWlCatalog(companyId: string | undefined) {
  return useQuery({
    queryKey: ["wl-catalog", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<WlCatalog> => {
      const { data, error } = await supabase.functions.invoke("wl-sync", {
        body: { company_id: companyId, mode: "catalog" },
      });
      if (error) return { ready: false, categories: [], products: [] };
      const res = data as Partial<WlCatalog> | null;
      return {
        ready: !!res?.ready,
        categories: res?.categories ?? [],
        products: res?.products ?? [],
      };
    },
  });
}

/** lptId → (date → vagas vendidas no WL) puxado ao vivo. */
export type WlExternalMap = Record<string, Record<string, number>>;

/**
 * Pull ao vivo da disponibilidade do white-label (E2.5.1): para cada tipo de vaga da
 * unidade que tenha mapeamento WL (category/product slug), chama a Edge `wl-sync` e
 * devolve quantas vagas o WL já vendeu por data. Best-effort: se o WL falhar, não
 * derruba a tela (a Ocupação segue mostrando só o contador do hub).
 */
export function useWlExternalOccupancy(
  companyId: string | undefined,
  locationId: string | undefined,
  from: string | undefined,
  to: string | undefined,
) {
  return useQuery({
    queryKey: ["wl-occupancy", companyId, locationId, from, to],
    enabled: !!companyId && !!locationId && !!from && !!to,
    staleTime: 15_000,
    retry: false,
    queryFn: async (): Promise<{ ready: boolean; byLpt: WlExternalMap }> => {
      const { data: lpts, error } = await supabase
        .from("location_parking_type")
        .select("id, wl_category_slug, wl_product_slug")
        .eq("location_id", locationId!)
        .eq("is_active", true);
      if (error) throw error;

      const mapped = (lpts ?? []).filter((l) => l.wl_category_slug && l.wl_product_slug);
      if (mapped.length === 0) return { ready: false, byLpt: {} };

      const byLpt: WlExternalMap = {};
      let anyReady = false;
      await Promise.all(
        mapped.map(async (l) => {
          const { data, error: invErr } = await supabase.functions.invoke("wl-sync", {
            body: {
              company_id: companyId,
              category_slug: l.wl_category_slug,
              product_slug: l.wl_product_slug,
              start_date: from,
              end_date: to,
            },
          });
          if (invErr) return;
          const res = data as
            | { ready?: boolean; days?: { date: string; sold_wl?: number }[] }
            | null;
          if (res?.ready) anyReady = true;
          const m: Record<string, number> = {};
          // sold_wl = vendas próprias do white-label (o que o hub não enxerga).
          // sold_external seria o que o hub empurrou — já contado no booked_count do hub.
          for (const d of res?.days ?? []) m[d.date] = Number(d.sold_wl ?? 0);
          byLpt[l.id] = m;
        }),
      );
      return { ready: anyReady, byLpt };
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
