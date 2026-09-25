/**
 * Leitura das traduções de post, para a página do post em outro idioma.
 *
 * Mesmo desenho do destino e da FAQ: o portão é a RLS (`is_published`) e o SLUG
 * viaja junto do idioma no tipo. É a regra que nasceu do `hreflang` que apontou
 * para 404 em 25/09/2026: toda URL montada a partir de um dado com versão por
 * idioma carrega o idioma no tipo, senão alguém monta a URL com o slug errado.
 *
 * Uma diferença em relação à FAQ: aqui o `body_md` é o post inteiro, e traduzir
 * título sem traduzir corpo entregaria uma página com manchete em inglês e texto
 * em português. Por isso `fetchPostTraduzidoPorSlug` exige corpo, e não só slug.
 */

import { supabase } from "@/lib/supabase";
import { LOCALES_TRADUZIDOS, type LocaleTraduzido } from "@/lib/i18n";

export type PostTraducao = {
  blog_post_id: string;
  locale: LocaleTraduzido;
  slug: string;
  title: string;
  excerpt: string | null;
  meta_title: string | null;
  meta_description: string | null;
  body_md: string;
};

const SELECT =
  "blog_post_id, locale, slug, title, excerpt, meta_title, meta_description, body_md";

/**
 * Traduções publicadas que viram URL: precisam de slug, título E corpo.
 *
 * O corpo entra no filtro porque é ele que faz a página existir. Post traduzido
 * pela metade não é uma página em inglês, é uma página em português com manchete
 * em inglês, e essa é pior que a ausência dela.
 */
export async function fetchTraducoesDePost(): Promise<PostTraducao[]> {
  const { data, error } = await supabase
    .from("blog_post_i18n")
    .select(SELECT)
    .not("slug", "is", null)
    .not("title", "is", null)
    .not("body_md", "is", null);
  if (error) throw error;
  return (data ?? []) as PostTraducao[];
}

/** A tradução de um post num idioma, resolvida pelo slug daquele idioma. */
export async function fetchPostTraduzidoPorSlug(
  slug: string,
  locale: LocaleTraduzido,
): Promise<PostTraducao | null> {
  const { data, error } = await supabase
    .from("blog_post_i18n")
    .select(SELECT)
    .eq("locale", locale)
    .eq("slug", slug)
    .not("title", "is", null)
    .not("body_md", "is", null)
    .maybeSingle();
  if (error) throw error;
  return (data as PostTraducao) ?? null;
}

export type IdiomaDoPost = { locale: LocaleTraduzido; slug: string };

/**
 * Os idiomas em que um post existe, com o slug de cada um.
 *
 * Só entra tradução completa (slug + título + corpo), pela mesma razão do filtro
 * acima: listar no `hreflang` um idioma cuja página não vai existir é anunciar
 * um endereço vazio.
 */
export function idiomasDoPost(traducoes: PostTraducao[], postId: string): IdiomaDoPost[] {
  const porLocale = new Map(
    traducoes
      .filter((t) => t.blog_post_id === postId && t.slug && t.title && t.body_md)
      .map((t) => [t.locale, t.slug]),
  );
  return LOCALES_TRADUZIDOS.filter((l) => porLocale.has(l)).map((l) => ({
    locale: l,
    slug: porLocale.get(l)!,
  }));
}
