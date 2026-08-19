import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { LocationAddressAuditRow } from "@/types/domain";

/**
 * Auditoria de endereço das unidades (painel do Manager).
 *
 * Tudo passa por RPC. A tabela `location_address_audit` só concede SELECT a hub_admin e não
 * concede escrita nenhuma por PostgREST: quem grava é a Edge (service_role) e as RPCs
 * definer. Isso é deliberado, porque uma correção de endereço precisa arrastar o re-vínculo
 * do destino junto, e um UPDATE solto deixaria a unidade ancorada no aeroporto antigo.
 *
 * Spec: docs/specs/auditoria-enderecos.md
 */

export const locationAddressAuditKeys = {
  all: ["location-address-audit"] as const,
  list: (onlyFlagged: boolean) => [...locationAddressAuditKeys.all, "list", onlyFlagged] as const,
};

/**
 * `numeric` do Postgres chega como string no PostgREST. Sem converter, a tela formataria a
 * distância como texto e a ordenação por drift compararia string.
 */
function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchAudit(onlyFlagged: boolean): Promise<LocationAddressAuditRow[]> {
  const { data, error } = await supabase.rpc("manager_location_address_audit", {
    p_only_flagged: onlyFlagged,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    distance_km: toNumber(row.distance_km),
    match_latitude: toNumber(row.match_latitude),
    match_longitude: toNumber(row.match_longitude),
    name_similarity: toNumber(row.name_similarity),
    drift_m: toNumber(row.drift_m),
    suggested_distance_km: toNumber(row.suggested_distance_km),
    flags: Array.isArray(row.flags) ? row.flags : [],
  })) as unknown as LocationAddressAuditRow[];
}

/** Admin (hub_admin): as unidades auditadas, opcionalmente só as que têm algo a olhar. */
export function useLocationAddressAudit(onlyFlagged: boolean) {
  return useQuery({
    queryKey: locationAddressAuditKeys.list(onlyFlagged),
    queryFn: () => fetchAudit(onlyFlagged),
  });
}

/** Roda a triagem local (sem custo de API) e devolve quantas unidades foram varridas. */
export function useRunAddressScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("manager_location_address_scan");
      if (error) throw error;
      return data ?? 0;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: locationAddressAuditKeys.all }),
  });
}

export type AddressVerifyResult = {
  checked: number;
  ok_count: number;
  divergent: number;
  no_match: number;
  failed: number;
};

/**
 * Dispara a verificação no Google (Edge `location-address-audit`).
 *
 * Sem `GOOGLE_PLACES_SERVER_KEY` configurada a Edge responde 500 com a explicação, e a tela
 * mostra essa frase em vez de um erro genérico: é a diferença entre "está quebrado" e "falta
 * a chave de servidor".
 */
export function useVerifyAddresses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (locationId?: string): Promise<AddressVerifyResult> => {
      const { data, error } = await supabase.functions.invoke("location-address-audit", {
        body: locationId ? { location_id: locationId } : {},
      });
      if (error) {
        // A mensagem útil vem no corpo da resposta, não no erro do supabase-js.
        const contexto = (error as { context?: Response }).context;
        const detalhe = await contexto
          ?.json()
          .then((b: { error?: string; hint?: string }) =>
            [b.error, b.hint].filter(Boolean).join(". "),
          )
          .catch(() => null);
        throw new Error(detalhe || error.message);
      }
      return data as AddressVerifyResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: locationAddressAuditKeys.all }),
  });
}

export type ApplyAddressInput = {
  locationId: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  googlePlaceId?: string | null;
  googleMapsUrl?: string | null;
  relinkDestination?: boolean;
  note?: string | null;
};

export type ApplyAddressResult = {
  destination_before: string | null;
  destination_after: string | null;
  destination_changed: boolean;
  distance_km_before: number | null;
  distance_km_after: number | null;
};

/**
 * Grava a correção. Campo ausente não é tocado (a RPC usa coalesce), e o re-vínculo do
 * destino sai ligado por padrão porque é o motivo de a RPC existir.
 */
export function useApplyAddressCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ApplyAddressInput): Promise<ApplyAddressResult> => {
      const args = {
        p_location_id: input.locationId,
        p_address: input.address ?? null,
        p_latitude: input.latitude ?? null,
        p_longitude: input.longitude ?? null,
        p_google_place_id: input.googlePlaceId ?? null,
        p_google_maps_url: input.googleMapsUrl ?? null,
        p_relink_destination: input.relinkDestination ?? true,
        p_note: input.note ?? null,
      };
      const { data, error } = await supabase.rpc(
        "manager_location_address_apply",
        args as never,
      );
      if (error) throw error;
      return data as unknown as ApplyAddressResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: locationAddressAuditKeys.all }),
  });
}

/** Conferido e mantido como está. Sem isso, o mesmo caso volta na lista em toda passada. */
export function useDismissAddressAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ locationId, note }: { locationId: string; note?: string }) => {
      const { error } = await supabase.rpc("manager_location_address_dismiss", {
        p_location_id: locationId,
        p_note: note ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: locationAddressAuditKeys.all }),
  });
}
