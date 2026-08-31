import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  ProspectLocationAdminRow,
  ProspectLocationInput,
  ProspectLocationPrecheck,
} from "@/types/domain";

/**
 * Painel de curadoria dos lotes mapeados (E0.17-h · ADR-010).
 *
 * Tudo passa por RPC, e nenhuma chamada toca a tabela direto. O motivo está na migration
 * `20261009000000`: o `select` de `prospect_location` foi revogado e reconcedido em 13
 * colunas, as que a página de destino renderiza. Grant de coluna não separa `hub_admin` de
 * cliente logado, então `phone`, `google_place_id`, `data_source` e os carimbos de curadoria
 * ficam ilegíveis até para o admin, e um `select *` aqui voltaria `42501 permission denied
 * for column phone`. A escrita segue o mesmo caminho porque o `.select()` que o supabase-js
 * emite depois de um insert esbarraria no mesmo corte.
 *
 * Spec: docs/specs/lote-mapeado-vitrine.md § Painel administrativo.
 */

/** Recorte da lista. `all` é o padrão da tela e vira `null` na RPC. */
export type ProspectLocationState = "all" | "draft" | "published" | "converted";

export type ProspectLocationFilters = {
  destinationId?: string;
  state?: ProspectLocationState;
  search?: string;
};

/** Ação de linha da curadoria. Campo ausente não mexe no carimbo (tri-estado da RPC). */
export type ProspectLocationStatePatch = {
  id: string;
  isPublished?: boolean;
  notified?: boolean;
  reviewed?: boolean;
};

/** Entrada da pré-checagem do formulário. Só lat/long são obrigatórias. */
export type ProspectLocationPrecheckArgs = {
  latitude: number;
  longitude: number;
  googlePlaceId?: string | null;
  slug?: string | null;
  id?: string | null;
};

export const prospectLocationsKeys = {
  all: ["prospect-locations"] as const,
  list: (filters: ProspectLocationFilters) =>
    [...prospectLocationsKeys.all, "list", filters] as const,
};

/**
 * A lista do painel, já com o estado derivado e a distância ao destino.
 *
 * Filtro vazio não vai no corpo: a RPC trata `null`, mas mandar `p_state: "all"` ou uma
 * busca só com espaço espalha lixo pelo cache do React Query, que usa os filtros na key.
 *
 * `numeric` do Postgres pode chegar como string no PostgREST, então lat/long e a distância
 * passam por `Number()`. Sem isso a tela formataria "1012" como texto e a ordenação por
 * distância compararia string.
 */
async function fetchProspectLocations(
  filters: ProspectLocationFilters,
): Promise<ProspectLocationAdminRow[]> {
  const busca = filters.search?.trim();
  const { data, error } = await supabase.rpc("manager_prospect_locations", {
    ...(filters.destinationId ? { p_destination_id: filters.destinationId } : {}),
    ...(filters.state && filters.state !== "all" ? { p_state: filters.state } : {}),
    ...(busca ? { p_search: busca } : {}),
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    distance_m: Number(row.distance_m),
    amenities: Array.isArray(row.amenities) ? (row.amenities as string[]) : [],
  })) as unknown as ProspectLocationAdminRow[];
}

/** Admin (hub_admin): os lotes mapeados, com recorte por destino, estado e busca. */
export function useProspectLocations(filters: ProspectLocationFilters) {
  return useQuery({
    queryKey: prospectLocationsKeys.list(filters),
    queryFn: () => fetchProspectLocations(filters),
  });
}

/**
 * Cria (`id: null`) ou edita um lote mapeado, e devolve o id da ficha.
 *
 * Quem recusa publicar sem endereço e recusa editar ficha convertida é a RPC, com a frase
 * pronta para a tela. Aqui o erro só sobe inteiro.
 */
export function useSaveProspectLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProspectLocationInput): Promise<string> => {
      const args = {
        p_id: input.id,
        p_name: input.name,
        p_slug: input.slug,
        p_latitude: input.latitude,
        p_longitude: input.longitude,
        p_destination_id: input.destinationId,
        p_address: input.address,
        p_phone: input.phone,
        p_google_place_id: input.googlePlaceId,
        p_google_maps_url: input.googleMapsUrl,
        p_description: input.description,
        p_amenities: input.amenities,
        p_data_source: input.dataSource,
        p_is_published: input.isPublished,
        p_researched_daily_brl: input.researchedDailyBrl,
        p_researched_weekly_brl: input.researchedWeeklyBrl,
        p_researched_biweekly_brl: input.researchedBiweeklyBrl,
        p_researched_monthly_brl: input.researchedMonthlyBrl,
        p_researched_at: input.researchedAt,
        p_research_source: input.researchSource,
      };
      // Os params têm default no SQL e aceitam null; o type gen do Supabase não reflete isso.
      const { data, error } = await supabase.rpc("manager_prospect_location_save", args as never);
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: prospectLocationsKeys.all }),
  });
}

/**
 * Publicar/despublicar, marcar notificado, marcar revisado.
 *
 * Separado do save porque é o trabalho recorrente da curadoria e não deve exigir abrir e
 * reenviar o formulário inteiro. Campo não informado fica de fora do corpo, e aí a RPC lê
 * `null` e não mexe naquele carimbo: mandar `false` por omissão zeraria a data de "dono
 * notificado" toda vez que alguém só clicasse no toggle de publicado.
 */
export function useSetProspectLocationState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isPublished, notified, reviewed }: ProspectLocationStatePatch) => {
      const { error } = await supabase.rpc("manager_prospect_location_set_state", {
        p_id: id,
        ...(isPublished === undefined ? {} : { p_is_published: isPublished }),
        ...(notified === undefined ? {} : { p_notified: notified }),
        ...(reviewed === undefined ? {} : { p_reviewed: reviewed }),
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: prospectLocationsKeys.all }),
  });
}

/** Exclui a ficha de vez. A RPC recusa a convertida, que guarda a procedência da conversão. */
export function useDeleteProspectLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("manager_prospect_location_delete", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: prospectLocationsKeys.all }),
  });
}

/**
 * Sugere o destino pela geo e avisa de colisão de place_id, de slug e de vizinhança.
 *
 * É mutation, e não query, porque quem dispara é um evento do formulário (mudou a
 * coordenada, saiu do campo de slug), não a montagem de uma tela. Como query, cada
 * combinação de rascunho viraria uma entrada de cache que ninguém lê de novo.
 */
export function useProspectLocationPrecheck() {
  return useMutation({
    mutationFn: async (args: ProspectLocationPrecheckArgs): Promise<ProspectLocationPrecheck> => {
      const { data, error } = await supabase.rpc("manager_prospect_location_precheck", {
        p_latitude: args.latitude,
        p_longitude: args.longitude,
        ...(args.googlePlaceId ? { p_google_place_id: args.googlePlaceId } : {}),
        ...(args.slug ? { p_slug: args.slug } : {}),
        ...(args.id ? { p_id: args.id } : {}),
      });
      if (error) throw error;
      return data as unknown as ProspectLocationPrecheck;
    },
  });
}
