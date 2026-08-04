import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";
import type {
  CheckoutMode,
  Location,
  LocationExternalReadiness,
  LocationWithDestination,
} from "@/types/domain";
import type { LocationOption } from "@/features/manager-filters/managerFilters.logic";

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
  externalReadiness: (id: string) => [...locationsKeys.all, "external-readiness", id] as const,
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
 * Unidades que o operador pode ver, SEMPRE escopadas às empresas dele.
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
 * Todas as unidades da rede, com a empresa, pro seletor de unidade do Manager.
 * Sem recorte por empresa de propósito: o hub_admin filtra a rede inteira. As
 * apagadas ficam de fora (soft delete); as inativas continuam, porque histórico
 * de reserva de unidade desativada ainda precisa ser filtrável.
 */
export function useManagerLocations() {
  return useQuery({
    queryKey: [...locationsKeys.all, "manager-options"] as const,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LocationOption[]> => {
      const { data, error } = await supabase
        .from("location")
        .select("id, name, company:company(id, name)")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      const rows = (data ?? []) as unknown as {
        id: string;
        name: string;
        company: { id: string; name: string } | null;
      }[];
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        companyName: r.company?.name ?? "Sem empresa",
      }));
    },
  });
}

/**
 * Tamanho da rede (unidades e empresas ativas), pro bloco de contexto da sidebar
 * do Manager. Duas contagens, sem trazer linha: é rótulo, não relatório.
 */
export function useNetworkSize(enabled = true) {
  return useQuery({
    queryKey: [...locationsKeys.all, "network-size"] as const,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ locations: number; companies: number }> => {
      const [locations, companies] = await Promise.all([
        supabase
          .from("location")
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .is("deleted_at", null),
        supabase
          .from("company")
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .is("deleted_at", null),
      ]);
      return { locations: locations.count ?? 0, companies: companies.count ?? 0 };
    },
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

/**
 * Pré-voo do checkout externo (E0.14). Diz se dá para apontar a unidade para o
 * white-label e, quando não dá, o que falta. Só hub_admin recebe resposta: a RPC
 * recusa qualquer outro JWT.
 */
export function useLocationExternalReadiness(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: id ? locationsKeys.externalReadiness(id) : ["locations", "external-readiness", "none"],
    queryFn: async (): Promise<LocationExternalReadiness | null> => {
      if (!id) return null;
      const { data, error } = await supabase.rpc("location_external_readiness", {
        p_location_id: id,
      });
      if (error) throw error;
      return data as unknown as LocationExternalReadiness;
    },
    enabled: !!id && enabled,
  });
}

/**
 * Muda onde a reserva da unidade fecha. A UI é espelho: quem decide é o banco, que
 * exige hub_admin e reprova o pré-voo incompleto (trigger location_checkout_mode_guard).
 */
export function useSetCheckoutMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, mode }: { id: string; mode: CheckoutMode }) => {
      const { data, error } = await supabase
        .from("location")
        .update({ checkout_mode: mode })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Location;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: locationsKeys.all }),
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
