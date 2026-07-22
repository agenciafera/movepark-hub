import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";
import type { Location, LocationWithDestination } from "@/types/domain";

type LocationInsert = Database["public"]["Tables"]["location"]["Insert"];
type LocationUpdate = Database["public"]["Tables"]["location"]["Update"];

// Subset de destination embarcado nas leituras de lote (rotulagem + geo da âncora).
const destinationEmbed =
  "destination:destination(id, code, name, short_name, type, latitude, longitude)";

/** Unidade como o painel do operador a consome: com a empresa e o resumo de vagas. */
export type OperatorLocation = Location & {
  company: { id: string; name: string } | null;
  parking_types: { capacity: number; is_active: boolean }[] | null;
};

export const locationsKeys = {
  all: ["locations"] as const,
  byCompany: (companyId: string) => [...locationsKeys.all, "company", companyId] as const,
  detail: (id: string) => [...locationsKeys.all, "detail", id] as const,
  forOperator: () => [...locationsKeys.all, "operator"] as const,
  nearestDestination: (lat: number, lng: number) =>
    [...locationsKeys.all, "nearest-destination", lat, lng] as const,
};

export function useLocationsByCompany(companyId: string | undefined) {
  return useQuery({
    queryKey: companyId ? locationsKeys.byCompany(companyId) : ["locations", "company", "none"],
    queryFn: async (): Promise<LocationWithDestination[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("location")
        .select(`*, ${destinationEmbed}`)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as LocationWithDestination[];
    },
    enabled: !!companyId,
  });
}

/** Resolve o destino publicado mais próximo de um ponto (RPC nearest_destination → uuid|null). */
export function useNearestDestination(lat: number | null, lng: number | null) {
  return useQuery({
    queryKey:
      lat != null && lng != null
        ? locationsKeys.nearestDestination(lat, lng)
        : ["locations", "nearest-destination", "none"],
    queryFn: async (): Promise<string | null> => {
      if (lat == null || lng == null) return null;
      const { data, error } = await supabase.rpc("nearest_destination", {
        p_lat: lat,
        p_lng: lng,
      });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    enabled: lat != null && lng != null,
  });
}

/**
 * Localizações que o operador pode ver, SEMPRE escopadas às empresas dele.
 *
 * Passe `effectiveCompanyIds` do useAuth (as empresas reais do usuário, ou a empresa em
 * impersonation do hub_admin). O RLS de `location` tem uma policy de catálogo pública
 * (o site do consumidor lista estacionamentos ativos), então filtrar por empresa aqui NÃO é
 * opcional: sem o `.in`, um operador enxergaria unidades de todas as empresas. Lista vazia de
 * ids não busca nada, em vez de cair para "tudo".
 */
export function useOperatorLocations(companyIds: string[] | undefined) {
  const ids = companyIds ?? [];
  return useQuery({
    queryKey: [...locationsKeys.forOperator(), ...ids] as const,
    queryFn: async (): Promise<OperatorLocation[]> => {
      const { data, error } = await supabase
        .from("location")
        .select(
          "*, company:company(id, name), parking_types:location_parking_type(capacity, is_active)",
        )
        .is("deleted_at", null)
        .in("company_id", ids)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as OperatorLocation[];
    },
    enabled: ids.length > 0,
  });
}

/**
 * Resumo do que a unidade tem, para o card da listagem.
 *
 * Só conta tipo de vaga ATIVO: um tipo desativado não vende, então somar a
 * capacidade dele inflaria o número que o parceiro usa pra conferir a operação.
 * `photos` é a coluna Json da própria `location` (mesma fonte que o onboarding
 * usa em `journey.ts` pra decidir o nudge de foto).
 */
export function summarizeLocation(loc: OperatorLocation) {
  const active = (loc.parking_types ?? []).filter((t) => t.is_active);
  return {
    spots: active.reduce((sum, t) => sum + (t.capacity ?? 0), 0),
    types: active.length,
    photos: Array.isArray(loc.photos) ? loc.photos.length : 0,
  };
}

export function useLocation(id: string | undefined) {
  return useQuery({
    queryKey: id ? locationsKeys.detail(id) : ["locations", "detail", "none"],
    queryFn: async (): Promise<Location | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("location")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Location | null;
    },
    enabled: !!id,
  });
}

export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LocationInsert) => {
      const { data, error } = await supabase.from("location").insert(payload).select().single();
      if (error) throw error;
      return data as Location;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: locationsKeys.all }),
  });
}

export function useUpdateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: LocationUpdate }) => {
      const { data, error } = await supabase
        .from("location")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Location;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: locationsKeys.all }),
  });
}
