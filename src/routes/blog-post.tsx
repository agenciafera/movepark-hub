import { Link, useLoaderData, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { CoverImage } from "@/features/blog/CoverImage";
import { PostBody } from "@/features/blog/PostBody";
import { useBlogPost, useRelatedPosts } from "@/features/blog/api";
import {
  leadFrom,
  metaDescription,
  plainText,
  readingMinutes,
} from "@/features/blog/markdown.logic";
import { blogPostingSchema, breadcrumbSchema } from "@/lib/jsonld";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { optimizedImageUrl } from "@/lib/storage";
import type { BlogPostWithDestination } from "@/types/domain";

const SITE_URL = "https://hub.movepark.co";

/**
 * O post ocupa a largura de conteúdo (1080), não a de leitura (720).
 *
 * Com 720 no container inteiro o desktop entregava 656px de texto e uma capa do
 * mesmo tamanho, sobrando 360px de branco de cada lado. É essa largura que deixa
 * o cabeçalho abrir em duas colunas.
 *
 * A prosa continua presa em 68ch, a mesma medida das páginas de conteúdo
 * (`ContentPageView`): container largo com coluna de leitura estreita é o
 * formato de artigo, e esticar o parágrafo até 1016px daria 100 caracteres por
 * linha, quando o confortável para 16px para em torno de 75.
 */
const CONTAINER = "mx-auto max-w-[1080px] px-4 py-12 desktop:px-8";
/**
 * Alinhada à esquerda, não centralizada: a capa começa na borda do container, e
 * uma coluna centralizada dava à página um terceiro eixo, entre a borda da capa
 * e a borda do título. Encostada na esquerda, tudo o que se lê de cima a baixo
 * (capa, texto, CTA, "Leia também") divide a mesma margem.
 */
const COLUNA_DE_LEITURA = "max-w-[68ch]";

export default function BlogPostPage() {
  const params = useParams();
  const loaded = useLoaderData() as BlogPostWithDestination | null;
  const query = useBlogPost(loaded ? undefined : params.slug);
  const post = loaded ?? query.data ?? null;

  const related = useRelatedPosts(post?.destination_id, post?.slug);

  if (!post) {
    if (query.isLoading) {
      return (
        <div className={CONTAINER}>
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="mt-6 h-64 w-full rounded-2xl" />
        </div>
      );
    }
    return (
      <div className={CONTAINER}>
        <EmptyState
          title="Post não encontrado."
          description="Ele pode ter saído do ar."
          action={
            <Button asChild>
              <Link to="/blog/">Ver todos os posts</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const canonical = `${SITE_URL}/blog/${post.slug}/`;
  const title = post.meta_title ?? post.title;
  const description = metaDescription(post.meta_description, post.excerpt, post.body_md);
  const minutes = readingMinutes(post.body_md);
  const ogImage = post.cover_image_url
    ? optimizedImageUrl(post.cover_image_url, { width: 1200, height: 630, resize: "cover" })
    : null;

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        {/*
          A capa já é URL absoluta do bucket, então prefixar com SITE_URL produzia
          "https://hub.movepark.cohttps://…", que nenhum crawler resolve: os 94
          posts ficaram sem imagem no card social. O `optimizedImageUrl` devolve
          absoluto e ainda entrega o 1.91:1 (1200x630) que o card espera, do mesmo
          jeito que a página de destino faz.

          As quatro metas vão soltas de propósito. O react-helmet-async só lê
          filhos diretos: agrupar num fragmento faz ele descartar o bloco inteiro
          em silêncio, que foi como o og:image sumiu da página por um deploy.
        */}
        {ogImage && <meta property="og:image" content={ogImage} />}
        {ogImage && <meta property="og:image:width" content="1200" />}
        {ogImage && <meta property="og:image:height" content="630" />}
        {ogImage && <meta property="og:image:alt" content={post.title} />}
        <meta property="article:published_time" content={post.published_at} />
        <script type="application/ld+json">
          {JSON.stringify(
            blogPostingSchema({
              title: post.title,
              slug: post.slug,
              description,
              image: post.cover_image_url,
              publishedAt: post.published_at,
              updatedAt: post.updated_at,
              authorName: post.author?.name ?? post.author_name,
              wordCount: plainText(post.body_md).split(/\s+/).filter(Boolean).length,
            }),
          )}
        </script>
        <script type="application/ld+json">
          {JSON.stringify(
            breadcrumbSchema([
              { name: "Início", url: `${SITE_URL}/` },
              { name: "Blog", url: `${SITE_URL}/blog/` },
              { name: post.title, url: canonical },
            ]),
          )}
        </script>
      </Helmet>

      <article className={CONTAINER}>
        {/*
          Cabeçalho em duas colunas no desktop: capa ao lado do título.

          Empilhado, a capa era uma faixa de 520px entre a manchete e a primeira
          linha do texto, e quem chegava de busca via título e imagem, rolava, e só
          então descobria do que o post tratava. Lado a lado, título, resumo e
          primeiro parágrafo cabem na mesma tela.

          No mobile a ordem do DOM manda (título, capa, texto), que é a ordem de
          leitura certa; a capa só vai para a esquerda quando há duas colunas.
        */}
        <div className="grid gap-6 desktop:grid-cols-[1.1fr_1fr] desktop:items-center desktop:gap-10">
          <div className="min-w-0">
            <PageHeader
              variant="content"
              back={{ to: "/blog/", label: "Voltar para o blog" }}
              eyebrow={post.destination?.name ?? undefined}
              title={post.title}
              description={leadFrom(post.excerpt, post.body_md) ?? undefined}
            >
              <p className="mt-1 text-caption-sm text-muted">
                {post.author && (
                  <>
                    <Link to={`/blog/autor/${post.author.slug}/`} className="hover:underline">
                      {post.author.name}
                    </Link>
                    {" · "}
                  </>
                )}
                {formatDate(post.published_at)} · {minutes} min de leitura
                {post.category && (
                  <>
                    {" · "}
                    <Link to={`/blog/categoria/${post.category.slug}/`} className="hover:underline">
                      {post.category.name}
                    </Link>
                  </>
                )}
              </p>
            </PageHeader>
          </div>

          {post.cover_image_url && (
            <CoverImage
              src={post.cover_image_url}
              alt={post.title}
              widths={[600, 900, 1200]}
              sizes="(min-width: 1144px) 512px, 100vw"
              className="rounded-2xl border border-hairline desktop:order-first"
              eager
            />
          )}
        </div>

        <div className={cn(COLUNA_DE_LEITURA, "mt-10")}>
          <PostBody markdown={post.body_md} />

          {post.tags.length > 0 && (
            <nav aria-label="Tags do post" className="mt-10 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Link
                  key={tag.id}
                  to={`/blog/tag/${tag.slug}/`}
                  className="rounded-full border border-hairline px-3 py-1.5 text-caption text-body hover:bg-surface-soft"
                >
                  {tag.name}
                </Link>
              ))}
            </nav>
          )}
        </div>

        {/*
          CTA por destino. Ele é o motivo de `destination_id` existir: sem isso o
          post preserva o ranking e não tem para onde mandar o leitor. Post sem
          destino (Navegantes, que ainda não existe no Hub) simplesmente não mostra.

          Fica no container todo, fora da coluna de leitura: é o elemento de
          conversão da página, e aqui o leitor já terminou de ler.
        */}
        {post.destination && (
          <aside className="mt-12 rounded-2xl border border-hairline bg-surface-soft p-6">
            <h2 className="text-display-sm text-ink">Vai viajar por {post.destination.name}?</h2>
            <p className="mt-2 max-w-[56ch] text-body-md text-body">
              Compare os estacionamentos parceiros e garanta sua vaga antes de sair de casa.
            </p>
            <Button asChild className="mt-4">
              <Link to={`/destinos/${post.destination.slug}`}>Ver estacionamentos</Link>
            </Button>
          </aside>
        )}

        {/* Duas colunas no container largo: lista de uma coluna com 1016px de
            largura deixa a linha do link curta e o branco à direita enorme. */}
        {related.data && related.data.length > 0 && (
          <section className="mt-12">
            <h2 className="text-display-sm text-ink">Leia também</h2>
            <ul className="mt-4 grid grid-cols-1 gap-3 tablet:grid-cols-2 tablet:gap-x-8">
              {related.data.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/blog/${p.slug}/`}
                    className="text-body-md text-mp-primary underline underline-offset-2"
                  >
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </>
  );
}
