import { Link, useLoaderData } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useBlogPosts } from "@/features/blog/api";
import { breadcrumbSchema, itemListSchema } from "@/lib/jsonld";
import { formatDate } from "@/lib/format";
import type { BlogPostWithDestination } from "@/types/domain";

/** O índice não carrega `body_md`: o corpo só é lido na página do post. */
type PostCardData = Pick<
  BlogPostWithDestination,
  "id" | "slug" | "title" | "excerpt" | "cover_image_url" | "published_at" | "destination"
>;

const SITE_URL = "https://hub.movepark.co";

function PostCard({ post }: { post: PostCardData }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-hairline bg-canvas">
      <Link to={`/blog/${post.slug}/`} className="block">
        {post.cover_image_url && (
          <img
            src={post.cover_image_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="aspect-[16/9] w-full object-cover"
          />
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-5">
        {post.destination && (
          <span className="text-caption-sm text-muted">{post.destination.name}</span>
        )}
        <h2 className="text-title-md text-ink">
          <Link to={`/blog/${post.slug}/`} className="hover:underline">
            {post.title}
          </Link>
        </h2>
        {post.excerpt && <p className="line-clamp-3 text-body-sm text-body">{post.excerpt}</p>}
        <p className="mt-auto pt-2 text-caption-sm text-muted">
          {formatDate(post.published_at)}
        </p>
      </div>
    </article>
  );
}

export default function BlogIndexPage() {
  // No SSG o loader já entrega a lista; no client o hook cobre a navegação.
  const loaded = useLoaderData() as PostCardData[] | null;
  const query = useBlogPosts();
  const posts: PostCardData[] = loaded?.length ? loaded : (query.data ?? []);
  const loading = !loaded?.length && query.isLoading;

  const title = "Blog | Movepark";
  const description =
    "Guias de estacionamento em aeroportos: preço, distância do terminal e o que olhar antes de reservar sua vaga.";

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`${SITE_URL}/blog/`} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={`${SITE_URL}/blog/`} />
        <script type="application/ld+json">
          {JSON.stringify(
            breadcrumbSchema([
              { name: "Início", url: `${SITE_URL}/` },
              { name: "Blog", url: `${SITE_URL}/blog/` },
            ]),
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

      <div className="mx-auto max-w-[1280px] px-4 py-12 desktop:px-8">
        <PageHeader
          variant="content"
          title="Blog"
          description="Guias de estacionamento nos aeroportos onde a Movepark opera: preço, distância do terminal e o que olhar antes de reservar."
        />

        {loading ? (
          <div className="mt-10 grid gap-6 tablet:grid-cols-2 desktop:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-80 w-full rounded-2xl" />
            ))}
          </div>
        ) : posts.length ? (
          <div className="mt-10 grid gap-6 tablet:grid-cols-2 desktop:grid-cols-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <EmptyState className="mt-10" title="Nenhum post publicado ainda." />
        )}
      </div>
    </>
  );
}
