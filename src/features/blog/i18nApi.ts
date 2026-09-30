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
export function idiomasDoPost(
  traducoes: {
    blog_post_id: string;
    locale: LocaleTraduzido;
    slug: string;
    title: string;
    /**
     * AUSENTE significa "já filtrado na consulta"; PRESENTE é checado aqui.
     *
     * A distinção existe porque a consulta leve não traz o corpo (ele é o campo caro,
     * e são uns 12 KB por post) mas filtra `body_md not.is.null` no servidor. Exigir o
     * campo aqui obrigaria a baixar o acervo traduzido inteiro só para conferir que
     * ele não é nulo; ignorar o campo quando ele vem deixaria passar a linha nula de
     * quem chamar com dado cru.
     */
    body_md?: string | null;
  }[],
  postId: string,
): IdiomaDoPost[] {
  const temCorpo = (t: { body_md?: string | null }) => !("body_md" in t) || Boolean(t.body_md);
  const porLocale = new Map(
    traducoes
      .filter((t) => t.blog_post_id === postId && t.slug && t.title && temCorpo(t))
      .map((t) => [t.locale, t.slug]),
  );
  return LOCALES_TRADUZIDOS.filter((l) => porLocale.has(l)).map((l) => ({
    locale: l,
    slug: porLocale.get(l)!,
  }));
}

/**
 * As mesmas traduções, SEM o corpo.
 *
 * O `SELECT` acima traz `body_md` porque a página do post precisa dele. Quem só
 * monta URL (o `getStaticPaths`, o `hreflang`, a listagem) não precisa, e o custo
 * cresce com o acervo: a cada post traduzido são uns 12 KB a mais baixados em toda
 * execução, e o build roda isso uma vez por rota traduzida. O filtro continua
 * exigindo corpo (`not.is.null`), que é o que define se a página existe; ele só não
 * é mais trazido de volta.
 */
const SELECT_LEVE = "blog_post_id, locale, slug, title, excerpt";

export type PostTraducaoLeve = Omit<PostTraducao, "body_md" | "meta_title" | "meta_description">;

export async function fetchTraducoesDePostLeve(): Promise<PostTraducaoLeve[]> {
  const { data, error } = await supabase
    .from("blog_post_i18n")
    .select(SELECT_LEVE)
    .not("slug", "is", null)
    .not("title", "is", null)
    .not("body_md", "is", null);
  if (error) throw error;
  return (data ?? []) as PostTraducaoLeve[];
}

/** Um card da listagem traduzida: o texto vem da tradução, a capa e a data do original. */
export type PostTraduzidoNaLista = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  published_at: string;
  destination: { name: string; slug: string } | null;
};

/**
 * Os posts de um idioma, para o índice daquele idioma.
 *
 * Lista SÓ o que está traduzido, de propósito. Completar a página com os posts em
 * português daria ao leitor de inglês uma lista majoritariamente portuguesa e ao
 * buscador uma página que se declara inglesa com conteúdo em outra língua. Índice
 * curto e honesto é melhor que índice cheio e misturado.
 *
 * Capa, data e aeroporto vêm do post original por `!inner`: eles não têm versão por
 * idioma, e o `inner` garante que tradução órfã (post despublicado, apagado) some da
 * lista em vez de virar card sem imagem apontando para 404.
 */
export async function fetchListaTraduzida(locale: LocaleTraduzido): Promise<PostTraduzidoNaLista[]> {
  const { data, error } = await supabase
    .from("blog_post_i18n")
    .select(
      "blog_post_id, slug, title, excerpt," +
        " post:blog_post!inner(cover_image_url, published_at, is_published, deleted_at," +
        " destination:destination(name, slug))",
    )
    .eq("locale", locale)
    .not("slug", "is", null)
    .not("title", "is", null)
    .not("body_md", "is", null)
    .eq("post.is_published", true)
    .is("post.deleted_at", null);
  if (error) throw error;

  type Linha = {
    blog_post_id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    post: {
      cover_image_url: string | null;
      published_at: string;
      destination: { name: string; slug: string } | null;
    } | null;
  };

  return ((data ?? []) as unknown as Linha[])
    .map((l) => ({
      id: l.blog_post_id,
      slug: l.slug,
      title: l.title,
      excerpt: l.excerpt,
      cover_image_url: l.post?.cover_image_url ?? null,
      published_at: l.post?.published_at ?? "",
      destination: l.post?.destination ?? null,
    }))
    .sort((a, b) => b.published_at.localeCompare(a.published_at));
}
