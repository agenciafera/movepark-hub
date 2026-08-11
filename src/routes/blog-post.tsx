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
import { optimizedImageUrl } from "@/lib/storage";
import type { BlogPostWithDestination } from "@/types/domain";

const SITE_URL = "https://hub.movepark.co";

export default function BlogPostPage() {
  const params = useParams();
  const loaded = useLoaderData() as BlogPostWithDestination | null;
  const query = useBlogPost(loaded ? undefined : params.slug);
  const post = loaded ?? query.data ?? null;

  const related = useRelatedPosts(post?.destination_id, post?.slug);

  if (!post) {
    if (query.isLoading) {
      return (
        <div className="mx-auto max-w-[720px] px-4 py-12 desktop:px-8">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="mt-6 h-64 w-full rounded-2xl" />
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-[720px] px-4 py-12 desktop:px-8">
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

      <article className="mx-auto max-w-[720px] px-4 py-12 desktop:px-8">
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

        {post.cover_image_url && (
          <CoverImage
            src={post.cover_image_url}
            alt={post.title}
            widths={[720, 1080, 1440]}
            sizes="(min-width: 768px) 720px, 100vw"
            className="mt-8 rounded-2xl border border-hairline"
            eager
          />
        )}

        <div className="mt-8">
          <PostBody markdown={post.body_md} />
        </div>

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

        {/*
          CTA por destino. Ele é o motivo de `destination_id` existir: sem isso o
          post preserva o ranking e não tem para onde mandar o leitor. Post sem
          destino (Navegantes, que ainda não existe no Hub) simplesmente não mostra.
        */}
        {post.destination && (
          <aside className="mt-12 rounded-2xl border border-hairline bg-surface-soft p-6">
            <h2 className="text-display-sm text-ink">Vai viajar por {post.destination.name}?</h2>
            <p className="mt-2 text-body-md text-body">
              Compare os estacionamentos parceiros e garanta sua vaga antes de sair de casa.
            </p>
            <Button asChild className="mt-4">
              <Link to={`/destinos/${post.destination.slug}`}>Ver estacionamentos</Link>
            </Button>
          </aside>
        )}

        {related.data && related.data.length > 0 && (
          <section className="mt-12">
            <h2 className="text-display-sm text-ink">Leia também</h2>
            <ul className="mt-4 space-y-3">
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
