import { useMemo } from "react";
import { Helmet } from "react-helmet-async";
import DOMPurify from "dompurify";
import { Skeleton } from "@/components/ui/skeleton";
import { useLegalDocument } from "./api";
import { LEGAL_SANITIZE_CONFIG, LEGAL_PROSE_CLASS } from "./legalRender";

type Props = {
  slug: string;
  /** Título/descrição de fallback + SEO (o título real vem do banco). */
  title: string;
  description: string;
  /** Caminho canônico, ex.: "/termos". */
  canonicalPath: string;
};

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Renderiza um documento legal versionado do banco (Termos/Privacidade). O conteúdo é HTML de schema
 * restrito (Tiptap, autor = hub_admin), estilizado via child-selectors. Client-fetch: a edição no
 * Manager reflete na hora; a meta de SEO (Helmet) permanece no HTML estático do SSG.
 */
export function LegalDocumentPage({ slug, title, description, canonicalPath }: Props) {
  const { data, isLoading } = useLegalDocument(slug);
  const heading = data?.title ?? title;
  const url = `https://hub.movepark.co${canonicalPath}`;
  const safeHtml = useMemo(
    () => (data?.content ? DOMPurify.sanitize(data.content, LEGAL_SANITIZE_CONFIG) : ""),
    [data?.content],
  );

  return (
    <>
      <Helmet>
        <title>{title} | Movepark</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={`${title} | Movepark`} />
        <meta property="og:url" content={url} />
        <link rel="canonical" href={url} />
      </Helmet>

      <div className="mx-auto w-full max-w-[720px] px-4 py-12 desktop:px-8">
        <header className="mb-10 space-y-2">
          <h1 className="text-display-lg text-ink">{heading}</h1>
          {data?.published_at && (
            <p className="text-body-sm text-muted">
              Última atualização: {formatDate(data.published_at)}
            </p>
          )}
        </header>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : data ? (
          <div
            className={LEGAL_PROSE_CLASS}
            // Sanitizado (DOMPurify + allowlist) — não confia no schema client-side do editor.
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        ) : (
          <p className="text-body-md text-muted">Documento indisponível no momento.</p>
        )}
      </div>
    </>
  );
}
