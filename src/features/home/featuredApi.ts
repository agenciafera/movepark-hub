import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { searchKeys } from "@/features/search/api";
import { proximaPosicao, rotuloDeDestino, type NovaPosicao } from "./featured.logic";
import { caminhoFicha } from "@/lib/urls";

/**
 * Curadoria da vitrine da home (`/manager/destaques`).
 *
 * A unidade de curadoria é o TIPO DE VAGA, não o estacionamento: o card da home é uma oferta
 * ("Aeropark > Vaga Coberta"), e escolher só a unidade deixaria de fora justamente a decisão que
 * muda o preço e a foto do card.
 *
 * Tudo aqui passa pelo PostgREST com a RLS `home_featured_offer_admin_write`, que é `is_hub_admin()`
 * para leitura e escrita. Não existe policy de catálogo na tabela: o consumidor lê a RPC
 * `home_featured_offers`, que já aplica o gate de publicação. Uma porta pública só.
 */

export const homeFeaturedKeys = {
  all: ["home-featured"] as const,
  list: () => [...homeFeaturedKeys.all, "list"] as const,
  candidates: () => [...homeFeaturedKeys.all, "candidates"] as const,
};

/** Uma oferta que pode entrar na vitrine, já com o rótulo que a tela mostra. */
export type FeaturedCandidate = {
  locationParkingTypeId: string;
  companyName: string;
  companySlug: string;
  locationName: string;
  locationSlug: string;
  parkingTypeName: string;
  parkingTypeCode: string;
  /** Caminho da ficha pública, para o admin abrir o que está curando. */
  publicPath: string | null;
  destinationLabel: string | null;
  /** Sem tabela de preço o card não tem "a partir de", e a home descarta a linha na renderização. */
  temPreco: boolean;
};

/** Um destaque já curado, na ordem em que aparece na home. */
export type FeaturedRow = FeaturedCandidate & {
  id: string;
  sort_order: number;
  isActive: boolean;
  /** `null` quando está tudo certo. Preenchido quando a unidade saiu do ar por baixo da curadoria. */
  motivoForaDoAr: string | null;
};

/**
 * A oferta com tudo que a tela precisa nomear.
 *
 * `pricing_rule!location_parking_type_id` precisa do hint: a tabela tem duas FKs para
 * `location_parking_type` (a própria e `surcharge_source_id`), e sem ele o PostgREST recusa por
 * ambiguidade.
 */
const SELECT_OFERTA = `
  id,
  location:location_id (
    id, name, slug, public_slug, status, is_listed, deleted_at,
    company:company_id (id, name, slug, status, onboarding_status),
    destination:destination_id (code, name, short_name, public_slug)
  ),
  company_parking_type:company_parking_type_id (
    is_active,
    parking_type:parking_type_id (code, name)
  ),
  pricing_rule!location_parking_type_id (id)
`;

/** Mesmo select, com `!inner` onde a consulta de candidatos filtra por coluna do embed. */
const SELECT_CANDIDATO = `
  id,
  location:location_id!inner (
    id, name, slug, public_slug, status, is_listed, deleted_at,
    company:company_id!inner (id, name, slug, status, onboarding_status),
    destination:destination_id (code, name, short_name, public_slug)
  ),
  company_parking_type:company_parking_type_id!inner (
    is_active,
    parking_type:parking_type_id (code, name)
  ),
  pricing_rule!location_parking_type_id (id)
`;

/**
 * Por que este destaque não apareceria na home hoje.
 *
 * A curadoria é uma FK para o tipo de vaga e nada mais: nada impede a empresa de ser desativada
 * depois que alguém montou a lista. A RPC pública simplesmente para de devolver a linha, e sem
 * este aviso o card sumiria da home sem ninguém entender por quê.
 */
function motivoForaDoAr(lpt: any): string | null {
  const loc = lpt?.location;
  const empresa = loc?.company;
  if (!loc || !empresa) return "Unidade sem empresa";
  if (empresa.status !== "active") return "Empresa desativada";
  if (empresa.onboarding_status !== "active") return "Empresa fora do catálogo";
  if (loc.deleted_at || loc.status !== "active") return "Unidade desativada";
  if (!loc.is_listed) return "Unidade despublicada";
  if (lpt.company_parking_type?.is_active === false) return "Tipo de vaga desativado";
  return null;
}

function paraCandidato(lpt: any): FeaturedCandidate {
  const regras = Array.isArray(lpt.pricing_rule) ? lpt.pricing_rule : [lpt.pricing_rule];
  return {
    locationParkingTypeId: lpt.id,
    companyName: lpt.location?.company?.name ?? "Empresa removida",
    companySlug: lpt.location?.company?.slug ?? "",
    locationName: lpt.location?.name ?? "Unidade removida",
    locationSlug: lpt.location?.slug ?? "",
    parkingTypeName: lpt.company_parking_type?.parking_type?.name ?? "Tipo removido",
    parkingTypeCode: lpt.company_parking_type?.parking_type?.code ?? "",
    publicPath:
      lpt.location?.destination?.public_slug && lpt.location?.public_slug
        ? caminhoFicha(lpt.location.destination.public_slug, lpt.location.public_slug)
        : null,
    destinationLabel: rotuloDeDestino(lpt.location?.destination ?? null),
    temPreco: regras.filter(Boolean).length > 0,
  };
}

/** A lista curada, na ordem gravada. Inclui os destaques desligados e os que saíram do ar. */
export function useFeaturedOffersAdmin() {
  return useQuery({
    queryKey: homeFeaturedKeys.list(),
    queryFn: async (): Promise<FeaturedRow[]> => {
      const { data, error } = await supabase
        .from("home_featured_offer")
        .select(`id, sort_order, is_active, location_parking_type:location_parking_type_id (${SELECT_OFERTA})`)
        .order("sort_order");
      if (error) throw error;

      return ((data ?? []) as any[]).map((row) => {
        const lpt = row.location_parking_type;
        return {
          ...paraCandidato(lpt ?? {}),
          id: row.id,
          sort_order: row.sort_order,
          isActive: row.is_active,
          motivoForaDoAr: motivoForaDoAr(lpt),
        };
      });
    },
  });
}

/**
 * O que pode ser adicionado: todo tipo de vaga ativo de unidade publicável de empresa ativa.
 *
 * Os filtros vão no servidor por embed `!inner` em vez de peneirar no cliente, porque a lista
 * cresce com o catálogo e uma tela de curadoria que oferece unidade fora do ar convida ao erro
 * que ela existe para evitar.
 */
export function useFeaturedCandidates() {
  return useQuery({
    queryKey: homeFeaturedKeys.candidates(),
    queryFn: async (): Promise<FeaturedCandidate[]> => {
      const { data, error } = await supabase
        .from("location_parking_type")
        .select(SELECT_CANDIDATO)
        .eq("is_active", true)
        .eq("location.status", "active")
        .eq("location.is_listed", true)
        .is("location.deleted_at", null)
        .eq("location.company.status", "active")
        .eq("location.company.onboarding_status", "active")
        .eq("company_parking_type.is_active", true);
      if (error) throw error;

      return ((data ?? []) as any[])
        .map(paraCandidato)
        .sort(
          (a, b) =>
            a.companyName.localeCompare(b.companyName, "pt-BR") ||
            a.locationName.localeCompare(b.locationName, "pt-BR") ||
            a.parkingTypeName.localeCompare(b.parkingTypeName, "pt-BR"),
        );
    },
  });
}

function useInvalidarVitrine() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: homeFeaturedKeys.all });
    // A home lida na mesma sessão precisa acompanhar a edição, senão o admin salva e continua
    // vendo a vitrine antiga por 5 minutos de `staleTime`.
    qc.invalidateQueries({ queryKey: searchKeys.featuredOffers() });
  };
}

/** Entra no fim da lista: quem adicionou decide depois onde fica. */
export function useAddFeaturedOffer() {
  const invalidar = useInvalidarVitrine();
  return useMutation({
    mutationFn: async (vars: {
      locationParkingTypeId: string;
      atuais: { sort_order: number }[];
    }) => {
      const { data, error } = await supabase
        .from("home_featured_offer")
        .insert({
          location_parking_type_id: vars.locationParkingTypeId,
          sort_order: proximaPosicao(vars.atuais),
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
  });
}

export function useRemoveFeaturedOffer() {
  const invalidar = useInvalidarVitrine();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("home_featured_offer").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

/** Liga e desliga sem perder a posição na lista. */
export function useToggleFeaturedOffer() {
  const invalidar = useInvalidarVitrine();
  return useMutation({
    mutationFn: async (vars: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("home_featured_offer")
        .update({ is_active: vars.isActive })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

/**
 * Grava as posições que mudaram.
 *
 * Recebe só o diff (duas linhas, no caso de uma troca) porque reescrever a lista inteira a cada
 * clique gera N updates para mover um card, e cada update dispara o trigger de `updated_at` em
 * linha que não mudou de lugar.
 */
export function useReorderFeaturedOffers() {
  const invalidar = useInvalidarVitrine();
  return useMutation({
    mutationFn: async (posicoes: NovaPosicao[]) => {
      for (const p of posicoes) {
        const { error } = await supabase
          .from("home_featured_offer")
          .update({ sort_order: p.sort_order })
          .eq("id", p.id);
        if (error) throw error;
      }
    },
    onSuccess: invalidar,
  });
}
