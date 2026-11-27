/**
 * Leitura das traduções de FAQ, para a página própria da pergunta.
 *
 * Mesmo desenho do destino, e pelo mesmo motivo: o portão é a RLS, e o SLUG viaja
 * junto do idioma. Foi a falta disso que mandou um `hreflang` para 404 em 25/09/2026,
 * e a lição virou regra: toda vez que uma URL é montada a partir de um dado que tem
 * versão por idioma, o idioma tem que estar no tipo.
 */

import { supabase } from "@/lib/supabase";
import { LOCALES_TRADUZIDOS, type LocaleTraduzido } from "@/lib/i18n";
import { leituraDoBuild } from "@/lib/leitura-do-build";

export type FaqTraducao = {
  faq_id: string;
  locale: LocaleTraduzido;
  slug: string;
  question: string;
  answer: string;
  body_md: string | null;
};

const lerTraducoesDeFaq = leituraDoBuild(async () => {
  const { data, error } = await supabase
    .from("faq_i18n")
    .select("faq_id, locale, slug, question, answer, body_md")
    .not("slug", "is", null);
  if (error) throw error;
  return (data ?? []) as FaqTraducao[];
});

/**
 * Todas as traduções publicadas COM slug próprio, que são as que viram URL.
 *
 * Lida uma vez por build (`leituraDoBuild`): toda página de FAQ chama isto para montar o
 * `hreflang`, e eram ~1.700 leituras da tabela inteira por build. Devolve cópia da lista
 * para nenhum chamador ordenar no lugar o que a página seguinte vai receber.
 */
export async function fetchTraducoesDeFaq(): Promise<FaqTraducao[]> {
  return [...(await lerTraducoesDeFaq())];
}

/** A tradução de uma pergunta num idioma, resolvida pelo slug daquele idioma. */
export async function fetchFaqTraduzidaPorSlug(
  slug: string,
  locale: LocaleTraduzido,
): Promise<FaqTraducao | null> {
  const { data, error } = await supabase
    .from("faq_i18n")
    .select("faq_id, locale, slug, question, answer, body_md")
    .eq("locale", locale)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as FaqTraducao) ?? null;
}

export type IdiomaDaFaq = { locale: LocaleTraduzido; slug: string };

/**
 * Os idiomas em que uma pergunta existe, com o slug de cada um.
 *
 * Só entra quem tem slug próprio: sem slug não há URL naquele idioma, e listar no
 * `hreflang` uma alternativa sem endereço é o mesmo 404 de antes com outra roupa.
 */
export function idiomasDaFaq(traducoes: FaqTraducao[], faqId: string): IdiomaDaFaq[] {
  const porLocale = new Map(
    traducoes.filter((t) => t.faq_id === faqId && t.slug).map((t) => [t.locale, t.slug]),
  );
  return LOCALES_TRADUZIDOS.filter((l) => porLocale.has(l)).map((l) => ({
    locale: l,
    slug: porLocale.get(l)!,
  }));
}
