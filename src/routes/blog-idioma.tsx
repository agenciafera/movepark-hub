import * as React from "react";
import { useLoaderData, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { MagnifyingGlass } from "@phosphor-icons/react";

import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Input } from "@/components/ui/input";
import { FeaturedPostCard, PostCard } from "@/features/blog/PostCard";
import { Paginacao } from "@/features/blog/Paginacao";
import { pageSlice, searchPosts, totalPages } from "@/features/blog/listing.logic";
import { useListaTraduzida } from "@/features/blog/api";
import type { PostTraduzidoNaLista } from "@/features/blog/i18nApi";
import { breadcrumbSchema, itemListSchema } from "@/lib/jsonld";
import {
  LANG_HTML,
  LOCALES,
  LOCALE_PADRAO,
  OG_LOCALE,
  caminhoDoIndice,
  caminhoLocalizado,
  clusterHreflang,
  localeDoCaminho,
  type Locale,
  type LocaleTraduzido,
} from "@/lib/i18n";
import { textos } from "@/lib/i18nTextos";
import { cn } from "@/lib/utils";
import { OgImage } from "@/lib/ogImage";
import { SITE_URL } from "@/lib/site";

/** Largura de app, igual à do índice em português. */
const CONTAINER = "mx-auto w-full max-w-[1280px] px-4 desktop:px-8";

/**
 * O que o loader do índice traduzido entrega.
 *
 * `page` vem da URL e a fatia sai do loader, como no índice português, para o HTML
 * pré-renderizado já trazer os cards: crawler de IA não executa JS.
 */
export type BlogIndiceIdiomaData = {
  locale: LocaleTraduzido;
  posts: PostTraduzidoNaLista[];
  page: number;
  total: number;
};

/**
 * Índice do blog num idioma traduzido (`/en/blog`, `/es/blog`).
 *
 * É componente próprio, e não o `BlogListingPage` com um `if`, por duas razões. A
 * primeira é que o índice português carrega cinco eixos de taxonomia, chips de
 * categoria e busca sobre o acervo inteiro, e nenhum deles existe aqui: as taxonomias
 * não têm tradução, e oferecer um chip que leva a uma página em português seria o
 * mesmo defeito do `hreflang` quebrado. A segunda é risco: o índice português é a
 * única página indexável daquela família e a que já ranqueia, e enfiar idioma no meio
 * dele para ganhar reuso é mexer na página que dá dinheiro para economizar markup.
 *
 * A lista traz SÓ o que está traduzido. Completar com posts em português encheria a
 * página e esvaziaria a promessa dela.
 */
export default function BlogIndiceIdiomaPage() {
  const loaded = useLoaderData() as BlogIndiceIdiomaData | null;
  const { pathname } = useLocation();

  // O idioma vem do CAMINHO, não do loader: em navegação por dentro do site o dado
  // assado no build pode não chegar, e é o mesmo contrato das outras rotas de idioma.
  const locale = localeDoCaminho(pathname).locale as LocaleTraduzido;
  const T = textos(locale);
  const base = caminhoDoIndice("blog", locale);

  const page = paginaDoCaminho(pathname);

  /*
    Duas fontes, como no índice português: o loader entrega a FATIA daquela página, que
    é o que sai no HTML do build, e o hook traz o acervo do idioma depois, que é o que a
    busca e a paginação precisam.

    A primeira versão fatiava `loaded.posts` de novo, e como ele JÁ vinha fatiado a
    página 2 saía vazia: `pageSlice(6 itens, página 2)` é lista vazia. O `audit-
    structured-data` pegou, porque o `ItemList` saiu sem item nenhum nas duas páginas 2.
  */
  const acervo = useListaTraduzida(locale);
  const todos = React.useMemo(() => acervo.data ?? [], [acervo.data]);
  const daPagina = loaded?.locale === locale && loaded.page === page ? loaded.posts : [];
  const temAcervo = todos.length > 0;

  const [termo, setTermo] = React.useState("");
  const buscando = termo.trim().length > 0;
  const filtrados = React.useMemo(() => {
    if (!buscando) return todos;
    // Filtra por conjunto de slug, e não com o retorno de `searchPosts`: o helper
    // devolve o objeto que recebeu (o de `comTags`, com taxonomia vazia), e usar esse
    // retorno direto trocaria o tipo da lista no meio do componente.
    const casou = new Set(searchPosts(comTags(todos), termo).map((p) => p.slug));
    return todos.filter((p) => casou.has(p.slug));
  }, [todos, buscando, termo]);

  const posts = temAcervo ? (buscando ? filtrados : pageSlice(filtrados, page)) : daPagina;
  const total = buscando ? 1 : temAcervo ? totalPages(filtrados.length) : (loaded?.total ?? 1);

  const temDestaque = page === 1 && !buscando && posts.length > 1;
  const destaque = temDestaque ? posts[0] : null;
  const noGrid = temDestaque ? posts.slice(1) : posts;

  /*
    A URL de cada página, SEM barra final.

    `pageHref` devolve `/en/blog/` na página 1, que é a forma do português (a barra é
    contrato herdado do WordPress). Nos idiomas traduzidos o worker 301 essa barra para
    a forma sem, então declará-la como canônica apontaria a canônica para uma URL que
    redireciona. O build de 30/09/2026 já tinha saído assim: canônica com barra e
    auto-referência do `hreflang` sem, as duas na mesma página.
  */
  const hrefPagina = (p: number, b: string = base) => (p <= 1 ? b : `${b}/page/${p}`);
  const canonical = `${SITE_URL}${hrefPagina(page)}`;
  const metaTitle = page > 1 ? `${T.blogIndiceMetaTitle} (${T.blogPaginaN(page)})` : T.blogIndiceMetaTitle;

  // O cluster do índice é fixo: as três rotas existem por deploy, não por haver item
  // traduzido para listar. Só a página 1 entra; página 2 é `noindex`.
  const hreflangs =
    page === 1
      ? clusterHreflang(
          LOCALES.map((l: Locale) => ({
            locale: l,
            caminho: `${SITE_URL}${caminhoDoIndice("blog", l)}`,
          })),
        )
      : [];

  return (
    <>
      <Helmet htmlAttributes={{ lang: LANG_HTML[locale] }}>
        <title>{metaTitle}</title>
        <meta name="description" content={T.blogIndiceMetaDescription} />
        <link rel="canonical" href={canonical} />
        {hreflangs.map((h) => (
          <link key={h.hreflang} rel="alternate" hrefLang={h.hreflang} href={h.href} />
        ))}
        {page > 1 && <meta name="robots" content="noindex, follow" />}
        {page > 1 && <link rel="prev" href={`${SITE_URL}${hrefPagina(page - 1)}`} />}
        {page < total && <link rel="next" href={`${SITE_URL}${hrefPagina(page + 1)}`} />}
        <meta property="og:type" content="website" />
        <meta property="og:locale" content={OG_LOCALE[locale]} />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={T.blogIndiceMetaDescription} />
        <meta property="og:url" content={canonical} />
        <script type="application/ld+json">
          {JSON.stringify(
            breadcrumbSchema([
              { name: "Movepark", url: `${SITE_URL}/` },
              { name: T.blogIndiceTitulo, url: `${SITE_URL}${base}` },
            ]),
          )}
        </script>
        {/* Sem item a lista não sai: `ItemList` vazio é erro no teste de resultado rico,
            e foi o que o `audit-structured-data` apontou na página 2. */}
        {posts.length > 0 && (
          <script type="application/ld+json">
            {JSON.stringify(
              itemListSchema(
                posts.map((p) => ({
                  name: p.title,
                  url: `${SITE_URL}${caminhoLocalizado({ familia: "blog", slug: p.slug, locale })}`,
                })),
              ),
            )}
          </script>
        )}
      </Helmet>
      <OgImage area="conteudo" />

      <div className="border-b border-hairline bg-surface-soft">
        <div className={cn(CONTAINER, "py-12")}>
          <PageHeader
            variant="content"
            size="lg"
            title={T.blogIndiceTitulo}
            description={T.blogIndiceLead}
            contentClassName="max-w-[54ch]"
            actions={
              <label className="relative block w-full tablet:w-80">
                <MagnifyingGlass
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                  aria-hidden
                />
                <Input
                  value={termo}
                  onChange={(e) => setTermo(e.target.value)}
                  placeholder={T.blogIndiceBuscar}
                  aria-label={T.blogIndiceBuscar}
                  className="pl-9"
                />
              </label>
            }
          />
          {/* Diz em voz alta que este índice é menor que o português, em vez de deixar
              o leitor descobrir procurando um post que existe e não está listado. */}
          {T.blogIndiceSoTraduzidos && (
            <p className="mt-6 max-w-[60ch] text-body-sm text-muted">
              {T.blogIndiceSoTraduzidos}{" "}
              <a href={caminhoDoIndice("blog", LOCALE_PADRAO)} className="underline">
                {T.blogIndiceArquivoPt}
              </a>
            </p>
          )}
        </div>
      </div>

      <div className={cn(CONTAINER, "py-12")}>
        {posts.length ? (
          <>
            {buscando && (
              <p className="mt-8 text-body-sm text-muted">
                {T.blogIndiceEncontrados(posts.length)}
              </p>
            )}

            {destaque && (
              <div className="mt-10">
                <FeaturedPostCard post={destaque} locale={locale} />
              </div>
            )}

            <div className={destaque ? "mt-12 border-t border-hairline pt-8" : "mt-6"}>
              {destaque && (
                <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.4px] text-mp-indigo">
                  {T.blogIndiceMaisRecentes}
                </p>
              )}
              <div className="grid gap-x-6 gap-y-12 tablet:grid-cols-2 desktop:grid-cols-3">
                {noGrid.map((post) => (
                  <PostCard key={post.id} post={post} locale={locale} />
                ))}
              </div>
            </div>

            {!buscando && <Paginacao page={page} total={total} base={base} locale={locale} href={hrefPagina} />}
          </>
        ) : (
          <EmptyState
            className="mt-10"
            title={buscando ? T.blogIndiceNadaNaBusca : T.blogIndiceNenhumPost}
            description={buscando ? T.blogIndiceNadaNaBuscaTexto : undefined}
          />
        )}
      </div>
    </>
  );
}

/** `/en/blog/page/3` devolve 3. Reserva para quando o dado do build não chega. */
export function paginaDoCaminho(pathname: string): number {
  const seg = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const i = seg.indexOf("page");
  if (i < 0) return 1;
  return Math.max(1, Number(seg[i + 1]) || 1);
}

/**
 * `searchPosts` pede `tags`, `category` e `author` porque busca por eles no índice
 * português. Aqui não existe taxonomia traduzida, então a busca fica sobre título e
 * resumo, e os campos entram vazios em vez de a assinatura ser afrouxada para todo
 * mundo.
 */
function comTags(posts: PostTraduzidoNaLista[]) {
  return posts.map((p) => ({ ...p, category: null, author: null, tags: [] }));
}
