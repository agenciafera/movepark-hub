import { Link } from "react-router-dom";
import { CoverImage } from "./CoverImage";
import { formatDate } from "@/lib/format";
import type { BlogPostListItem } from "@/types/domain";

/**
 * Categoria e destino como eyebrow, não como texto cinza na linha da data.
 *
 * Antes os dois viviam na mesma linha da data, com o mesmo peso dela: o leitor
 * precisava ler para descobrir do que o post tratava. Como eyebrow eles viram um
 * rótulo escaneável, que é o papel que já cumprem no resto do consumer.
 */
function Eyebrow({ post }: { post: BlogPostListItem }) {
  const rotulo = post.category?.name ?? post.destination?.name;
  if (!rotulo) return null;
  return (
    <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-mp-indigo">
      {rotulo}
    </span>
  );
}

function Assinatura({ post }: { post: BlogPostListItem }) {
  return (
    <p className="text-caption-sm text-muted">
      {formatDate(post.published_at)}
      {post.author && ` · ${post.author.name}`}
    </p>
  );
}

/**
 * Card de arquivo: o peso mais leve da listagem.
 *
 * Ele é o segundo nível da hierarquia, e o que o separa do destaque é o tamanho
 * da manchete e o excerpt cortado em três linhas, não uma moldura diferente.
 */
export function PostCard({ post }: { post: BlogPostListItem }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-hairline bg-canvas">
      <Link to={`/blog/${post.slug}/`} className="block">
        {post.cover_image_url && (
          <CoverImage
            src={post.cover_image_url}
            alt={post.title}
            widths={[400, 600, 800]}
            sizes="(min-width: 1128px) 360px, (min-width: 768px) 50vw, 100vw"
          />
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <Eyebrow post={post} />
        <h2 className="text-title-md text-ink">
          <Link to={`/blog/${post.slug}/`} className="hover:underline">
            {post.title}
          </Link>
        </h2>
        {post.excerpt && <p className="line-clamp-3 text-body-sm text-body">{post.excerpt}</p>}
        <div className="mt-auto pt-2">
          <Assinatura post={post} />
        </div>
      </div>
    </article>
  );
}

/**
 * Destaque da listagem: capa ao lado do texto, não empilhada.
 *
 * A listagem eram doze cards do mesmo tamanho, e uma página onde nada é mais
 * importante que nada não tem ponto de entrada: o leitor varre e sai. O destaque
 * existe para dar esse ponto.
 *
 * O peso vem do layout, não de uma manchete gigante: a manchete é `display-sm`
 * (20px), um degrau abaixo do h1 da página, porque o contrato do consumer não
 * deixa nenhum h2 pesar mais que o h1. Quem faz o bloco dominar é a capa grande
 * e o excerpt inteiro, que o card de arquivo corta em três linhas.
 */
export function FeaturedPostCard({ post }: { post: BlogPostListItem }) {
  return (
    <article className="grid gap-5 desktop:grid-cols-[1.1fr_1fr] desktop:items-center desktop:gap-10">
      {post.cover_image_url && (
        <Link
          to={`/blog/${post.slug}/`}
          className="block overflow-hidden rounded-2xl border border-hairline"
        >
          <CoverImage
            src={post.cover_image_url}
            alt={post.title}
            widths={[600, 900, 1200]}
            sizes="(min-width: 1128px) 640px, 100vw"
            eager
          />
        </Link>
      )}
      <div className="flex flex-col gap-3">
        <Eyebrow post={post} />
        <h2 className="text-display-sm text-ink">
          <Link to={`/blog/${post.slug}/`} className="hover:underline">
            {post.title}
          </Link>
        </h2>
        {post.excerpt && <p className="text-body-md text-body">{post.excerpt}</p>}
        <Assinatura post={post} />
      </div>
    </article>
  );
}
