import { Link } from "react-router-dom";
import { CoverImage } from "./CoverImage";
import { formatDate } from "@/lib/format";
import { formatUpdated } from "@/features/content/types";
import { userInitials } from "@/lib/initials";
import { LOCALE_PADRAO, caminhoLocalizado, type Locale } from "@/lib/i18n";
import { textos } from "@/lib/i18nTextos";

/**
 * O que um card precisa, e nada mais.
 *
 * O tipo é estrutural em vez de `BlogPostListItem` porque o card também serve o
 * índice traduzido, onde o dado vem de `blog_post_i18n` e não tem categoria, autor
 * nem tags. Pedir o tipo cheio ali obrigaria a inventar campos nulos só para
 * satisfazer a assinatura, e campo inventado é o que depois alguém lê como dado.
 */
export type CardPost = {
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  published_at: string;
  category?: { name: string } | null;
  destination?: { name: string } | null;
  author?: { name: string; avatar_url?: string | null } | null;
};

/** O endereço do post naquele idioma. O slug JÁ é o do idioma; aqui só entra o caminho. */
function href(slug: string, locale: Locale): string {
  return caminhoLocalizado({ familia: "blog", slug, locale });
}

/**
 * Categoria e destino como eyebrow, não como texto cinza na linha da data.
 *
 * Antes os dois viviam na mesma linha da data, com o mesmo peso dela: o leitor
 * precisava ler para descobrir do que o post tratava. Como eyebrow eles viram um
 * rótulo escaneável, que é o papel que já cumprem no resto do consumer.
 */
function Eyebrow({ post }: { post: CardPost }) {
  const rotulo = post.category?.name ?? post.destination?.name;
  if (!rotulo) return null;
  return (
    <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-mp-indigo">
      {rotulo}
    </span>
  );
}

/**
 * Assinatura com rosto: avatar, nome e data.
 *
 * Sem foto cadastrada entram as iniciais, do mesmo helper que a topbar e a conta
 * usam. O avatar existe porque post de blog é assinado por gente, e o rosto é o
 * que separa uma assinatura de mais uma linha de metadado cinza.
 */
function Assinatura({ post, locale }: { post: CardPost; locale: Locale }) {
  const autor = post.author;
  return (
    <div className="flex items-center gap-2 text-caption-sm text-muted">
      {autor &&
        (autor.avatar_url ? (
          <img
            src={autor.avatar_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-6 w-6 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-strong text-[10px] font-bold text-ink"
          >
            {userInitials(autor.name)}
          </span>
        ))}
      <span className="min-w-0 truncate">
        {autor && `${autor.name} · `}
        {/* Em português fica `dd/MM/yyyy`, que é o formato do resto do consumer. Em
            inglês e espanhol a data sai por extenso, pelo `Intl`, porque `25/09/2026`
            é lido como 9 de maio por quem escreve a data ao contrário. */}
        {locale === LOCALE_PADRAO
          ? formatDate(post.published_at)
          : formatUpdated(post.published_at, textos(locale).intlLocale)}
      </span>
    </div>
  );
}

/**
 * Card de arquivo da listagem.
 *
 * Sem moldura: era um retângulo com borda e canto arredondado em volta de cada
 * post, e doze molduras iguais na tela viram grade de caixas, não lista de
 * leitura. A capa, o título e o resumo já delimitam o item sozinhos, e sem a
 * borda o título ganha o peso que a moldura tomava.
 */
export function PostCard({ post, locale = LOCALE_PADRAO }: { post: CardPost; locale?: Locale }) {
  return (
    <article className="flex flex-col">
      <Link to={href(post.slug, locale)} className="block">
        {post.cover_image_url && (
          <CoverImage
            src={post.cover_image_url}
            alt={post.title}
            widths={[400, 600, 800]}
            sizes="(min-width: 1128px) 360px, (min-width: 768px) 50vw, 100vw"
            className="rounded-md"
          />
        )}
      </Link>
      <div className="mt-4 flex flex-1 flex-col gap-2">
        <Eyebrow post={post} />
        <h2 className="text-display-sm text-ink">
          <Link to={href(post.slug, locale)} className="hover:underline">
            {post.title}
          </Link>
        </h2>
        {post.excerpt && <p className="line-clamp-3 text-body-md text-body">{post.excerpt}</p>}
        <div className="mt-auto pt-3">
          <Assinatura post={post} locale={locale} />
        </div>
      </div>
    </article>
  );
}

/**
 * Destaque da listagem: capa ao lado do texto, não empilhada.
 *
 * A listagem eram doze cards do mesmo tamanho, e uma página onde nada é mais
 * importante que nada não tem ponto de entrada: o leitor varre e sai.
 *
 * A manchete é `display-xl` (28px), o mesmo tier do h1 da página. Empatar com o
 * h1 é o limite: o contrato do consumer não deixa nenhum h2 pesar mais que ele.
 * Na referência o destaque tem o tamanho do nome da publicação, e é essa
 * proporção que faz o bloco abrir a página em vez de só ocupar espaço.
 */
export function FeaturedPostCard({
  post,
  locale = LOCALE_PADRAO,
}: {
  post: CardPost;
  locale?: Locale;
}) {
  return (
    <article className="grid gap-5 desktop:grid-cols-[1.15fr_1fr] desktop:items-center desktop:gap-10">
      {post.cover_image_url && (
        <Link to={href(post.slug, locale)} className="block">
          <CoverImage
            src={post.cover_image_url}
            alt={post.title}
            widths={[600, 900, 1200]}
            sizes="(min-width: 1128px) 640px, 100vw"
            className="rounded-md"
            eager
          />
        </Link>
      )}
      <div className="flex flex-col gap-3">
        <Eyebrow post={post} />
        <h2 className="text-display-xl text-ink">
          <Link to={href(post.slug, locale)} className="hover:underline">
            {post.title}
          </Link>
        </h2>
        {post.excerpt && <p className="text-body-md text-body">{post.excerpt}</p>}
        <div className="pt-1">
          <Assinatura post={post} locale={locale} />
        </div>
      </div>
    </article>
  );
}
