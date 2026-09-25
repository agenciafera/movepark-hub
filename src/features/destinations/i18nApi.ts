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
export function idiomasDoDestino(
  traducoes: DestinoTraduzido[],
  destinationId: string,
): LocaleTraduzido[] {
  const doDestino = new Set(
    traducoes.filter((t) => t.destination_id === destinationId).map((t) => t.locale),
  );
  return LOCALES_TRADUZIDOS.filter((l) => doDestino.has(l));
}
