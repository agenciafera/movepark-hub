import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  AddOnService,
  AddOnServiceWithAvailability,
  LocationAddOnService,
} from "@/types/domain";
import type { AddonUpsertArgs, LocationAddonArgs } from "./addons.logic";

export const addonsKeys = {
  all: ["addons"] as const,
  list: (companyId: string) => [...addonsKeys.all, "list", companyId] as const,
  locations: (companyId: string) => [...addonsKeys.all, "locations", companyId] as const,
};

export type OperatorLocation = { id: string; name: string };

/** Unidades ativas da empresa (para o editor de disponibilidade). */
export function useCompanyLocations(companyId: string | undefined) {
  return useQuery({
    queryKey: companyId ? addonsKeys.locations(companyId) : [...addonsKeys.all, "locations", "none"],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<OperatorLocation[]> => {
      const { data, error } = await supabase
        .from("location")
        .select("id, name")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as OperatorLocation[];
    },
  });
}

/**
 * Catálogo de serviços adicionais da empresa (inclui inativos — RLS de operator)
 * já com a disponibilidade/preço por unidade anexada.
 */
export function useCompanyAddons(companyId: string | undefined) {
  return useQuery({
    queryKey: companyId ? addonsKeys.list(companyId) : [...addonsKeys.all, "list", "none"],
    enabled: !!companyId,
    queryFn: async (): Promise<AddOnServiceWithAvailability[]> => {
      const { data: services, error } = await supabase
        .from("add_on_service")
        .select("*")
        .eq("company_id", companyId!)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;

      const list = (services ?? []) as AddOnService[];
      if (list.length === 0) return [];

      const { data: avail, error: availError } = await supabase
        .from("location_add_on_service")
        .select("*")
        .in(
          "add_on_service_id",
          list.map((s) => s.id),
        );
      if (availError) throw availError;

      const byService = new Map<string, LocationAddOnService[]>();
      for (const row of (avail ?? []) as LocationAddOnService[]) {
        const arr = byService.get(row.add_on_service_id) ?? [];
        arr.push(row);
        byService.set(row.add_on_service_id, arr);
      }

      return list.map((s) => ({ ...s, availability: byService.get(s.id) ?? [] }));
    },
  });
}

function useAddonInvalidate(companyId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: addonsKeys.all });
    if (companyId) qc.invalidateQueries({ queryKey: addonsKeys.list(companyId) });
  };
}

/** Cria/edita um serviço do catálogo (RPC SECURITY DEFINER). */
export function useUpsertAddon(companyId: string | undefined) {
  const invalidate = useAddonInvalidate(companyId);
  return useMutation({
    mutationFn: async (args: AddonUpsertArgs): Promise<string> => {
      // params da RPC aceitam null (default no SQL); o type gen do Supabase não reflete isso.
      const { data, error } = await supabase.rpc("operator_upsert_addon", args as never);
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: invalidate,
  });
}

/** Ativa/desativa + define preço por unidade (RPC SECURITY DEFINER). */
export function useSetLocationAddon(companyId: string | undefined) {
  const invalidate = useAddonInvalidate(companyId);
  return useMutation({
    mutationFn: async (args: LocationAddonArgs): Promise<void> => {
      // price_override pode ser null (usa o preço base); type gen marca como number.
      const { error } = await supabase.rpc("operator_set_location_addon", args as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

/** Exclui um serviço (bloqueado pela RPC se já usado em reserva). */
export function useDeleteAddon(companyId: string | undefined) {
  const invalidate = useAddonInvalidate(companyId);
  return useMutation({
    mutationFn: async (addOnServiceId: string): Promise<void> => {
      const { error } = await supabase.rpc("operator_delete_addon", {
        p_add_on_service_id: addOnServiceId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}
