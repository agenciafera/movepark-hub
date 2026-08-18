import { useMemo } from "react";
import { Helmet } from "react-helmet-async";
import DOMPurify from "dompurify";
import { Skeleton } from "@/components/ui/skeleton";
import { ContentPageView } from "@/features/content/ContentPageView";
import { RELACIONADOS } from "@/features/content/pages";
import { useLegalDocument } from "./api";
import { LEGAL_SANITIZE_CONFIG, LEGAL_PROSE_CLASS } from "./legalRender";
import { withSectionIds } from "./legalSections";
import { SITE_URL } from "@/lib/site";

type Props = {
  slug: string;
  /** Título/descrição de fallback + SEO (o título real vem do banco). */
  title: string;
  description: string;
  /** Uma frase dizendo ao leitor o que o documento cobre. */
  intro: string;
  /** Caminho canônico, ex.: "/termos". */
  canonicalPath: string;
  /** Slugs dos cards de "Veja também". */
  related?: string[];
};

/**
 * Documento legal versionado do banco (Termos/Privacidade). O conteúdo é HTML de schema
 * restrito (Tiptap, autor = hub_admin), estilizado via child-selectors. Client-fetch: a edição no
 * Manager reflete na hora; a meta de SEO (Helmet) permanece no HTML estático do SSG.
 *
 * O texto continua vindo do banco porque a linha de aceite aponta pra versão exata
 * que o cliente leu. Da casca de conteúdo vêm só a moldura e o índice, e o índice é
 * derivado dos `h2` do próprio documento: o jurídico não precisa mudar nada.
 */
export function LegalDocumentPage({
  slug,
  title,
  description,
  intro,
  canonicalPath,
  related = [],
}: Props) {
  const { data, isLoading } = useLegalDocument(slug);
  const heading = data?.title ?? title;
  const url = `${SITE_URL}${canonicalPath}`;

  const { html: safeHtml, sections } = useMemo(() => {
    if (!data?.content) return { html: "", sections: [] };
    // Sanitiza ANTES de mexer: o índice trabalha sobre HTML já confiável.
    return withSectionIds(DOMPurify.sanitize(data.content, LEGAL_SANITIZE_CONFIG));
  }, [data?.content]);

  // Documento legal se lê inteiro; não há bloco pra contar palavra. 200 wpm sobre
  // o texto puro do HTML dá a mesma medida das outras páginas.
  const readMinutes = useMemo(() => {
    const texto = safeHtml.replace(/<[^>]+>/g, " ");
    const palavras = texto.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(palavras / 200));
  }, [safeHtml]);

  return (
    <>
      <Helmet>
        <title>{title} | Movepark</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={`${title} | Movepark`} />
        <meta property="og:url" content={url} />
        <link rel="canonical" href={url} />
      </Helmet>

      <ContentPageView
        label={title}
        title={heading}
        intro={intro}
        updated={data?.published_at ?? null}
        readMinutes={readMinutes}
        sections={sections.map((s) => ({ ...s, blocks: [] }))}
        related={related.map((s) => RELACIONADOS[s]).filter(Boolean)}
      >
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
      </ContentPageView>
    </>
  );
}
