/**
 * Leitura das traduções de destino.
 *
 * O portão é a RLS: `destination_i18n_select` só devolve linha publicada para o
 * papel anônimo, então o build não consegue gerar URL de tradução em rascunho nem
 * por engano. O código aqui nem filtra por `is_published`, e isso é de propósito:
 * a regra mora num lugar só, e é o lugar que o `select` esquecido não escapa.
 */

import { supabase } from "@/lib/supabase";
import { LOCALES_TRADUZIDOS, type LocaleTraduzido } from "@/lib/i18n";

export type DestinoTraduzido = {
  destination_id: string;
  locale: LocaleTraduzido;
  slug: string | null;
  seo_label: string | null;
  meta_title: string | null;
  meta_description: string | null;
  intro: string | null;
};

/** Todas as traduções publicadas, para o build gerar as rotas e o cluster. */
export async function fetchDestinosTraduzidos(): Promise<DestinoTraduzido[]> {
  const { data, error } = await supabase
    .from("destination_i18n")
    .select("destination_id, locale, slug, seo_label, meta_title, meta_description, intro");
  if (error) throw error;
  return (data ?? []) as DestinoTraduzido[];
}

/** O slug daquele idioma, com queda para o slug público original. */
export function slugDoIdioma(t: DestinoTraduzido | undefined, slugOriginal: string): string {
  return t?.slug?.trim() || slugOriginal;
}

/**
 * Os idiomas em que um destino existe, sempre com o português na frente.
 *
 * É a entrada do `clusterHreflang`: só entra idioma cuja linha voltou da consulta, e
 * a consulta já é filtrada pela RLS. Tradução em rascunho não vira `hreflang`, que é
 * a invariante que impede o cluster inteiro de ficar suspeito.
 */
export type IdiomaDoDestino = { locale: LocaleTraduzido; slug: string };

/**
 * Os idiomas em que um destino existe, COM o slug de cada um.
 *
 * O slug viaja junto porque o `hreflang` precisa da URL final, e a URL de cada idioma
 * usa o slug daquele idioma. A primeira versão devolvia só a lista de idiomas, e a
 * página montava o caminho com o slug português para todos: o cluster foi para
 * produção apontando `/en/airport-parking/aeroporto-guarulhos`, que é 404, quando a
 * página real é `/en/airport-parking/guarulhos-airport`.
 *
 * Ou seja, o cluster prometia tradução e entregava página inexistente, que é
 * exatamente o defeito que o portão existe para impedir. O tipo agora obriga o slug.
 */
export function idiomasDoDestino(
  traducoes: DestinoTraduzido[],
  destinationId: string,
  slugOriginal: string,
): IdiomaDoDestino[] {
  const porLocale = new Map(
    traducoes.filter((t) => t.destination_id === destinationId).map((t) => [t.locale, t]),
  );
  return LOCALES_TRADUZIDOS.filter((l) => porLocale.has(l)).map((l) => ({
    locale: l,
    slug: slugDoIdioma(porLocale.get(l), slugOriginal),
  }));
}

/**
 * Tradução de pergunta do FAQ e de post, para a página de destino.
 *
 * O portão continua sendo a RLS: `faq_i18n_select` e `blog_post_i18n_select` só
 * devolvem linha publicada para o papel anônimo. O código não filtra, pelo mesmo
 * motivo de antes: a regra mora num lugar só.
 *
 * A leitura é por LOTE, uma consulta por tabela com todos os ids da página, e não uma
 * por pergunta. São até 14 perguntas por destino e 27 destinos no build; uma consulta
 * por item esbarraria no statement timeout do papel anônimo.
 */

export type FaqTraduzido = {
  faq_id: string;
  locale: LocaleTraduzido;
  slug: string | null;
  question: string | null;
  answer: string | null;
  body_md: string | null;
};

export async function fetchFaqsTraduzidos(
  faqIds: string[],
  locale: LocaleTraduzido,
): Promise<Map<string, FaqTraduzido>> {
  if (faqIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("faq_i18n")
    .select("faq_id, locale, slug, question, answer, body_md")
    .eq("locale", locale)
    .in("faq_id", faqIds);
  if (error) throw error;
  return new Map(((data ?? []) as FaqTraduzido[]).map((t) => [t.faq_id, t]));
}

export type PostTraduzido = {
  blog_post_id: string;
  locale: LocaleTraduzido;
  slug: string | null;
  title: string | null;
  excerpt: string | null;
};

export async function fetchPostsTraduzidos(
  postIds: string[],
  locale: LocaleTraduzido,
): Promise<Map<string, PostTraduzido>> {
  if (postIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("blog_post_i18n")
    .select("blog_post_id, locale, slug, title, excerpt")
    .eq("locale", locale)
    .in("blog_post_id", postIds);
  if (error) throw error;
  return new Map(((data ?? []) as PostTraduzido[]).map((t) => [t.blog_post_id, t]));
}

/**
 * Aplica a tradução sobre a lista original, DESCARTANDO o que não foi traduzido.
 *
 * Descartar é a regra, e não completar com o português: pergunta em português no meio
 * de uma lista em inglês faz a página parecer descuidada justo onde ela deveria
 * provar cuidado, e é o mesmo motivo pelo qual o portão existe. Meia tradução não é
 * meio caminho, é um defeito visível.
 *
 * Em português devolve a lista intacta, porque lá não há tradução a aplicar.
 */
export function aplicaTraducao<T extends { id: string }, R>(
  itens: T[],
  traducoes: Map<string, R> | null,
  mescla: (item: T, t: R) => T,
): T[] {
  if (!traducoes) return itens;
  return itens.flatMap((i) => {
    const t = traducoes.get(i.id);
    return t ? [mescla(i, t)] : [];
  });
}
