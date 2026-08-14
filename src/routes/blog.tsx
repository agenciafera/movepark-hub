import * as React from "react";
import { Link, useLoaderData, useLocation, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FeaturedPostCard, PostCard } from "@/features/blog/PostCard";
import {
  useBlogAuthors,
  useBlogCategories,
  useBlogPostList,
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
import { cn } from "@/lib/utils";
import type { BlogPostListItem } from "@/types/domain";
import { OgImage } from "@/lib/ogImage";

const SITE_URL = "https://hub.movepark.co";

/** Largura de app. O padding vertical fica com cada faixa. */
const CONTAINER = "mx-auto w-full max-w-[1280px] px-4 desktop:px-8";

/** O que o loader entrega para a listagem, seja ela o índice ou um arquivo. */
export type BlogListingData = {
  posts: BlogPostListItem[];
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

  /*
    O eixo vem da URL, não do loader.

    O `vite-react-ssg` indexa o dado assado no build por caminho SEM barra final,
    e os links do blog levam a barra, que é a canônica herdada do WordPress. Ao
    navegar por dentro do site a chave não casava e a listagem vinha vazia.
  */
  const { kind, slug, page, base } = parseBlogPath(pathname);

  /*
    Busca em estado local, não na URL.

    Antes cada tecla escrevia em `?q=`, o router revalidava a rota e o loader
    refazia a consulta inteira. Digitar uma palavra custava nove requisições.
    Agora o texto filtra o acervo em memória e a URL só é atualizada depois que
    a digitação para, para o link continuar compartilhável.
  */
  const [termo, setTermo] = React.useState(() => params.get("q") ?? "");
  const buscando = termo.trim().length > 0;

  React.useEffect(() => {
    const t = setTimeout(() => {
      const atual = params.get("q") ?? "";
      if (atual === termo) return;
      setParams(termo ? { q: termo } : {}, { replace: true, preventScrollReset: true });
    }, 350);
    return () => clearTimeout(t);
  }, [termo, params, setParams]);

  /*
    O acervo enxuto (sem `body_md`) vem uma vez e fica no cache do TanStack Query.
    Busca e paginação passam a ser fatia de array, não requisição.
  */
  const acervo = useBlogPostList();
  const todos = React.useMemo(() => acervo.data ?? [], [acervo.data]);

  const doEixo = React.useMemo(
    () => (slug ? filterPosts(todos, { [kind]: slug } as Record<string, string>) : todos),
    [todos, slug, kind],
  );

  const filtrados = React.useMemo(
    () => (buscando ? searchPosts(doEixo, termo) : doEixo),
    [doEixo, buscando, termo],
  );

  // Enquanto o acervo não chega, mostra o que o build já pré-renderizou.
  const temAcervo = todos.length > 0;
  const posts = temAcervo
    ? buscando
      ? filtrados
      : pageSlice(filtrados, page)
    : (loaded?.posts ?? []);
  const total = temAcervo ? totalPages(filtrados.length) : (loaded?.total ?? 1);
  const carregando = !temAcervo && !loaded?.posts?.length && acervo.isLoading;

  /*
    O destaque é o post mais recente, e só existe na abertura do blog.

    Em arquivo de categoria, página 2 e resultado de busca ele atrapalha: nos três
    o leitor já sabe o que procura, e promover o primeiro da lista dá a ele um peso
    que a ordem por data não justifica.
  */
  const temDestaque = kind === "index" && page === 1 && !buscando && posts.length > 1;
  const destaque = temDestaque ? posts[0] : null;
  const noGrid = temDestaque ? posts.slice(1) : posts;

  /** Nome do eixo: do catálogo de taxonomia, com o loader como reserva. */
  const nomeDoEixo = () => {
    if (!slug) return null;
    if (kind === "categoria") return categories.data?.find((c) => c.slug === slug)?.name ?? null;
    if (kind === "tag") return tags.data?.find((t) => t.slug === slug)?.name ?? null;
    if (kind === "autor") return authors.data?.find((a) => a.slug === slug)?.name ?? null;
    return doEixo[0]?.destination?.name ?? null;
  };

  const doLoader = loaded?.kind === kind && loaded?.slug === slug ? loaded : null;
  const titulo = nomeDoEixo() ?? doLoader?.name ?? (kind === "index" ? "Blog" : (slug ?? "Blog"));
  /** Categoria e autor têm texto próprio cadastrado; tag e aeroporto não. */
  const descricaoDoEixo = () => {
    if (kind === "categoria") {
      return categories.data?.find((c) => c.slug === slug)?.description ?? doLoader?.description;
    }
    if (kind === "autor") return authors.data?.find((a) => a.slug === slug)?.bio;
    return null;
  };

  const leadPadrao =
    kind === "index"
      ? "Guias de estacionamento nos aeroportos onde a Movepark opera: preço, distância do terminal e o que olhar antes de reservar."
      : kind === "autor"
        ? `Posts assinados por ${titulo}.`
        : `Tudo o que publicamos sobre ${titulo}.`;

  const lead = descricaoDoEixo() ?? leadPadrao;

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
            itemListSchema(
              posts.map((p) => ({ name: p.title, url: `${SITE_URL}/blog/${p.slug}/` })),
            ),
          )}
        </script>
      </Helmet>
      <OgImage area="conteudo" />

      {/*
        O cabeçalho vive numa faixa própria, como na página do post: título,
        lead, busca e categorias são o painel de controle da listagem, e o fundo
        os agrupa em vez de deixar tudo boiando no mesmo branco do conteúdo. A
        faixa sangra na largura toda; o container mora dentro.
      */}
      <div className="border-b border-hairline bg-surface-soft">
        <div className={cn(CONTAINER, "py-12")}>
          {/*
          Título grande, lead curto e busca à direita.

          O título é `size="lg"` porque numa página de índice ele nomeia uma seção
          do site, não o assunto de um documento. O lead tem teto de medida: solto,
          ele atravessava os 1280px do container e virava uma linha de 140
          caracteres. A busca vai no slot de ação do header, que é onde ela para de
          empurrar as categorias para baixo.
        */}
          <PageHeader
            variant="content"
            size="lg"
            eyebrow={EYEBROW[kind]}
            title={titulo}
            description={lead}
            contentClassName="max-w-[54ch]"
            back={kind === "index" ? undefined : { to: "/blog/", label: "Voltar para o blog" }}
            actions={
              <label className="relative block w-full tablet:w-80">
                <MagnifyingGlass
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                  aria-hidden
                />
                <Input
                  value={termo}
                  onChange={(e) => setTermo(e.target.value)}
                  placeholder="Buscar no blog"
                  aria-label="Buscar no blog"
                  className="pl-9"
                />
              </label>
            }
          />

          {/*
            O hover do chip é `bg-canvas`, não `surface-soft`: sobre a faixa
            cinza o cinza do hover é a mesma cor do fundo, e o chip não responde
            ao mouse. Aqui ele clareia em vez de escurecer.
          */}
          <div className="mt-6 flex flex-col gap-4">
            <nav aria-label="Categorias" className="flex flex-wrap gap-2">
              <Link
                to="/blog/"
                className={cn(
                  "rounded-full border px-3 py-1.5 text-caption",
                  kind === "index"
                    ? "border-mp-primary bg-mp-primary text-white"
                    : "border-hairline text-body hover:border-mp-navy hover:bg-canvas",
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
                      : "border-hairline text-body hover:border-mp-navy hover:bg-canvas",
                  )}
                >
                  {c.name}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </div>

      <div className={cn(CONTAINER, "py-12")}>
        {carregando ? (
          <div className="mt-10 grid gap-6 tablet:grid-cols-2 desktop:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-80 w-full rounded-md" />
            ))}
          </div>
        ) : posts.length ? (
          <>
            {buscando && (
              <p className="mt-8 text-body-sm text-muted">
                {posts.length === 1 ? "1 post encontrado" : `${posts.length} posts encontrados`}
              </p>
            )}

            {destaque && (
              <div className="mt-10">
                <FeaturedPostCard post={destaque} />
              </div>
            )}

            <div className={destaque ? "mt-12 border-t border-hairline pt-8" : "mt-6"}>
              {destaque && (
                <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.4px] text-mp-indigo">
                  Mais recentes
                </p>
              )}
              {/* Sem moldura, quem separa uma linha da outra é o espaço: por isso
                  o respiro vertical é maior que o horizontal. */}
              <div className="grid gap-x-6 gap-y-12 tablet:grid-cols-2 desktop:grid-cols-3">
                {noGrid.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
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
