import * as React from "react";
import { Link, useLoaderData, useLocation, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useBlogAuthors,
  useBlogCategories,
  useBlogPosts,
  useBlogTags,
} from "@/features/blog/api";
import {
  filterPosts,
  pageHref,
  pageSlice,
  pageWindow,
  parseBlogPath,
  searchPosts,
  totalPages,
} from "@/features/blog/listing.logic";
import { breadcrumbSchema, itemListSchema } from "@/lib/jsonld";
import { formatDate } from "@/lib/format";
import { imageSrcSet, optimizedImageUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import type { BlogPostWithDestination } from "@/types/domain";

const SITE_URL = "https://hub.movepark.co";

/** O que o loader entrega para a listagem, seja ela o índice ou um arquivo. */
export type BlogListingData = {
  posts: BlogPostWithDestination[];
  page: number;
  total: number;
  kind: "index" | "categoria" | "tag" | "autor" | "aeroporto";
  slug: string | null;
  name: string | null;
  description: string | null;
  base: string;
};

const EYEBROW: Record<BlogListingData["kind"], string | undefined> = {
  index: undefined,
  categoria: "Categoria",
  tag: "Tag",
  autor: "Autor",
  aeroporto: "Aeroporto",
};

function PostCard({ post }: { post: BlogPostWithDestination }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-hairline bg-canvas">
      <Link to={`/blog/${post.slug}/`} className="block">
        {post.cover_image_url && (
          /*
            Capa sem corte e sem tarja.

            As capas do WordPress vão de 1:1 a 2,12:1, e boa parte é banner com a
            manchete gravada dentro da imagem. Recortar para a caixa cortava o
            texto em 104 das 131 imagens; trocar para `contain` resolveu o corte e
            deixou 31 delas com tarja chapada, e as 8 quadradas preenchendo 67%
            da caixa.

            A imagem entra duas vezes: uma desfocada preenchendo o fundo, e a de
            verdade inteira por cima. O fundo pede as DUAS dimensões (24x16, a
            mesma proporção da caixa): com só a largura, o render devolve uma tira
            de 16x1067 e o borrão vira listra. Custa 392 bytes contra 34 KB da
            imagem principal.
          */
          <div className="relative aspect-[3/2] w-full overflow-hidden bg-surface-soft">
            <img
              src={optimizedImageUrl(post.cover_image_url, {
                width: 24,
                height: 16,
                quality: 30,
                resize: "cover",
              })}
              alt=""
              aria-hidden
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full scale-110 object-cover blur-lg"
            />
            <img
              src={optimizedImageUrl(post.cover_image_url, { width: 800, resize: "contain" })}
              srcSet={imageSrcSet(post.cover_image_url, [400, 600, 800])}
              sizes="(min-width: 1128px) 360px, (min-width: 768px) 50vw, 100vw"
              alt=""
              loading="lazy"
              decoding="async"
              className="relative h-full w-full object-contain"
            />
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex flex-wrap items-center gap-x-2 text-caption-sm text-muted">
          {post.category && <span>{post.category.name}</span>}
          {post.category && post.destination && <span aria-hidden>·</span>}
          {post.destination && <span>{post.destination.name}</span>}
        </div>
        <h2 className="text-title-md text-ink">
          <Link to={`/blog/${post.slug}/`} className="hover:underline">
            {post.title}
          </Link>
        </h2>
        {post.excerpt && <p className="line-clamp-3 text-body-sm text-body">{post.excerpt}</p>}
        <p className="mt-auto pt-2 text-caption-sm text-muted">
          {formatDate(post.published_at)}
          {post.author && ` · ${post.author.name}`}
        </p>
      </div>
    </article>
  );
}

function Paginacao({ page, total, base }: { page: number; total: number; base: string }) {
  if (total <= 1) return null;

  return (
    <nav aria-label="Paginação" className="mt-10 flex flex-wrap items-center justify-center gap-2">
      {page > 1 && (
        <Link
          to={pageHref(page - 1, base)}
          rel="prev"
          className="rounded-sm border border-hairline px-3 py-2 text-body-sm text-body hover:bg-surface-soft"
        >
          Anterior
        </Link>
      )}

      {pageWindow(page, total).map((p, i) =>
        p === null ? (
          <span key={`gap-${i}`} className="px-1 text-body-sm text-muted" aria-hidden>
            ...
          </span>
        ) : (
          <Link
            key={p}
            to={pageHref(p, base)}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              "min-w-10 rounded-sm border px-3 py-2 text-center text-body-sm",
              p === page
                ? "border-mp-primary bg-mp-primary text-white"
                : "border-hairline text-body hover:bg-surface-soft",
            )}
          >
            {p}
          </Link>
        ),
      )}

      {page < total && (
        <Link
          to={pageHref(page + 1, base)}
          rel="next"
          className="rounded-sm border border-hairline px-3 py-2 text-body-sm text-body hover:bg-surface-soft"
        >
          Próxima
        </Link>
      )}
    </nav>
  );
}

export default function BlogListingPage() {
  const loaded = useLoaderData() as BlogListingData | null;
  const { pathname } = useLocation();
  const categories = useBlogCategories();
  const tags = useBlogTags();
  const authors = useBlogAuthors();
  const [params, setParams] = useSearchParams();
  const termo = params.get("q") ?? "";
  const buscando = termo.trim().length > 0;

  /*
    O eixo vem da URL, não do loader.

    O `vite-react-ssg` indexa o dado assado no build por caminho SEM barra final,
    e os links do blog levam a barra, que é a canônica herdada do WordPress. Ao
    navegar por dentro do site a chave não casava e a listagem vinha vazia, com o
    título caindo no default "Blog". Lendo o caminho aqui, a página se sustenta
    com ou sem o dado do build.
  */
  const rota = parseBlogPath(pathname);
  const { kind, slug, page, base } = rota;

  // Puxa o acervo quando o dado do build não veio, ou quando há busca.
  const semDadoDoBuild = !loaded?.posts?.length;
  const todos = useBlogPosts(semDadoDoBuild || buscando);

  const doEixo = React.useMemo(() => {
    if (loaded?.posts?.length && !buscando && loaded.page === page) return null;
    const acervo = todos.data ?? [];
    return slug ? filterPosts(acervo, { [kind]: slug } as Record<string, string>) : acervo;
  }, [loaded, buscando, page, todos.data, slug, kind]);

  const posts = buscando
    ? searchPosts(doEixo ?? [], termo)
    : (doEixo ? pageSlice(doEixo, page) : (loaded?.posts ?? []));

  const total = doEixo ? totalPages(doEixo.length) : (loaded?.total ?? 1);
  const carregando = (semDadoDoBuild || buscando) && todos.isLoading;

  /** Nome do eixo: do loader quando veio, senão do catálogo de taxonomia. */
  const nomeDoEixo = () => {
    if (loaded?.name && loaded.kind === kind && loaded.slug === slug) return loaded.name;
    if (!slug) return null;
    if (kind === "categoria") return categories.data?.find((c) => c.slug === slug)?.name ?? null;
    if (kind === "tag") return tags.data?.find((t) => t.slug === slug)?.name ?? null;
    if (kind === "autor") return authors.data?.find((a) => a.slug === slug)?.name ?? null;
    return doEixo?.[0]?.destination?.name ?? posts[0]?.destination?.name ?? null;
  };

  const titulo = nomeDoEixo() ?? (kind === "index" ? "Blog" : (slug ?? "Blog"));
  const descricaoDoEixo =
    kind === "categoria"
      ? (categories.data?.find((c) => c.slug === slug)?.description ?? loaded?.description ?? null)
      : null;
  const lead =
    descricaoDoEixo ??
    (kind === "index"
      ? "Guias de estacionamento nos aeroportos onde a Movepark opera: preço, distância do terminal e o que olhar antes de reservar."
      : `Tudo o que publicamos sobre ${titulo}.`);

  const canonical = `${SITE_URL}${pageHref(page, base)}`;
  // "Blog | Blog Movepark" era o que saía na página 2 do índice.
  const sufixo = kind === "index" ? "Movepark" : "Blog Movepark";
  const metaTitle = page > 1 ? `${titulo}, página ${page} | ${sufixo}` : `${titulo} | ${sufixo}`;
  const metaDesc =
    kind === "index"
      ? "Guias de estacionamento em aeroportos: preço, distância do terminal e o que olhar antes de reservar sua vaga."
      : lead;

  /*
    Arquivo de taxonomia e página 2 em diante saem do índice.

    Página de arquivo é lista de links, não conteúdo próprio, e a do aeroporto
    ainda disputaria a mesma busca que /destinos/<slug>, que é a página que
    converte. `follow` mantém o rastreio dos links.
  */
  const noindex = kind !== "index" || page > 1;

  return (
    <>
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDesc} />
        <link rel="canonical" href={canonical} />
        {noindex && <meta name="robots" content="noindex, follow" />}
        {page > 1 && <link rel="prev" href={`${SITE_URL}${pageHref(page - 1, base)}`} />}
        {page < total && <link rel="next" href={`${SITE_URL}${pageHref(page + 1, base)}`} />}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDesc} />
        <meta property="og:url" content={canonical} />
        <script type="application/ld+json">
          {JSON.stringify(
            breadcrumbSchema(
              [
                { name: "Início", url: `${SITE_URL}/` },
                { name: "Blog", url: `${SITE_URL}/blog/` },
                ...(kind === "index" ? [] : [{ name: titulo, url: `${SITE_URL}${base}/` }]),
              ].filter(Boolean),
            ),
          )}
        </script>
        <script type="application/ld+json">
          {JSON.stringify(
            itemListSchema(posts.map((p) => ({ name: p.title, url: `${SITE_URL}/blog/${p.slug}/` }))),
          )}
        </script>
      </Helmet>

      <div className="mx-auto max-w-[1280px] px-4 py-12 desktop:px-8">
        <PageHeader
          variant="content"
          eyebrow={EYEBROW[kind]}
          title={titulo}
          description={lead}
          back={kind === "index" ? undefined : { to: "/blog/", label: "Voltar para o blog" }}
        />

        <div className="mt-6 flex flex-col gap-4">
          <label className="relative block max-w-md">
            <MagnifyingGlass
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <Input
              value={termo}
              onChange={(e) => {
                const v = e.target.value;
                setParams(v ? { q: v } : {}, { replace: true });
              }}
              placeholder="Buscar no blog"
              aria-label="Buscar no blog"
              className="pl-9"
            />
          </label>

          <nav aria-label="Categorias" className="flex flex-wrap gap-2">
            <Link
              to="/blog/"
              className={cn(
                "rounded-full border px-3 py-1.5 text-caption",
                kind === "index"
                  ? "border-mp-primary bg-mp-primary text-white"
                  : "border-hairline text-body hover:bg-surface-soft",
              )}
            >
              Todos
            </Link>
            {(categories.data ?? []).map((c) => (
              <Link
                key={c.id}
                to={`/blog/categoria/${c.slug}/`}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-caption",
                  kind === "categoria" && slug === c.slug
                    ? "border-mp-primary bg-mp-primary text-white"
                    : "border-hairline text-body hover:bg-surface-soft",
                )}
              >
                {c.name}
              </Link>
            ))}
          </nav>
        </div>

        {carregando ? (
          <div className="mt-10 grid gap-6 tablet:grid-cols-2 desktop:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-80 w-full rounded-2xl" />
            ))}
          </div>
        ) : posts.length ? (
          <>
            {buscando && (
              <p className="mt-8 text-body-sm text-muted">
                {posts.length === 1
                  ? "1 post encontrado"
                  : `${posts.length} posts encontrados`}
              </p>
            )}
            <div className="mt-6 grid gap-6 tablet:grid-cols-2 desktop:grid-cols-3">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
            {!buscando && <Paginacao page={page} total={total} base={base} />}
          </>
        ) : (
          <EmptyState
            className="mt-10"
            title={buscando ? "Nada encontrado para essa busca." : "Nenhum post publicado ainda."}
            description={buscando ? "Tente outra palavra ou use as categorias acima." : undefined}
          />
        )}
      </div>
    </>
  );
}

