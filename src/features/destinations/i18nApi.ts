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
