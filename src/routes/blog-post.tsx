import { Link, useLoaderData, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { CoverImage } from "@/features/blog/CoverImage";
import { PostBody } from "@/features/blog/PostBody";
import { useBlogPost, useRelatedPosts } from "@/features/blog/api";
import { metaDescription, plainText, readingMinutes } from "@/features/blog/markdown.logic";
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
 * mesmo tamanho, sobrando 360px de branco de cada lado. A capa é banner com a
 * manchete gravada dentro, então ela é o que mais perdia.
 *
 * A prosa continua presa em 68ch, a mesma medida das páginas de conteúdo
 * (`ContentPageView`): container largo com coluna de leitura estreita é o
 * formato de artigo, e esticar o parágrafo até 1016px daria 100 caracteres por
 * linha, quando o confortável para 16px para em torno de 75.
 */
const CONTAINER = "mx-auto max-w-[1080px] px-4 py-12 desktop:px-8";
const COLUNA_DE_LEITURA = "mx-auto max-w-[68ch]";

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
        <div className={COLUNA_DE_LEITURA}>
          <PageHeader
            variant="content"
            back={{ to: "/blog/", label: "Voltar para o blog" }}
            eyebrow={post.destination?.name ?? undefined}
            title={post.title}
          >
            <p className="text-caption-sm text-muted">
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

        {/*
          A capa sai da coluna de leitura e usa o container todo: é banner com a
          manchete gravada dentro, o bloco que mais ganha em ser maior. A caixa 3:2
          ganha teto de altura porque 1016px de largura dariam 677px de altura, e a
          capa empurraria o primeiro parágrafo para fora da tela. O fundo desfocado
          do `CoverImage` é justamente o que preenche a sobra desse teto.

          O `sizes` acompanha a largura nova: errar esse valor faz o browser baixar
          o candidato errado do `srcset`.
        */}
        {post.cover_image_url && (
          <CoverImage
            src={post.cover_image_url}
            alt={post.title}
            widths={[720, 1080, 1440]}
            sizes="(min-width: 1144px) 1016px, 100vw"
            className="mt-8 max-h-[520px] rounded-2xl border border-hairline"
            eager
          />
        )}

        <div className={cn(COLUNA_DE_LEITURA, "mt-8")}>
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
