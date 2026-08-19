import { Helmet } from "react-helmet-async";
import { ContentPageView } from "@/features/content/ContentPageView";
import { CANCELAMENTO, RELACIONADOS } from "@/features/content/pages";
import { readingMinutes } from "@/features/content/types";
import { siteUrl } from "@/lib/site";

export default function CancelamentoPage() {
  const p = CANCELAMENTO;
  return (
    <>
      <Helmet>
        <title>Política de Cancelamento | Movepark</title>
        <meta
          name="description"
          content="Regras de cancelamento e reembolso da Movepark. O prazo e a política dependem de como você reservou: veja os detalhes por tipo de reserva."
        />
        <meta property="og:title" content="Política de Cancelamento | Movepark" />
        <meta property="og:url" content={siteUrl("/cancelamento")} />
        <link rel="canonical" href={siteUrl("/cancelamento")} />
      </Helmet>

      <ContentPageView
        label={p.label}
        title={p.title}
        intro={p.intro}
        updated={p.updated}
        readMinutes={readingMinutes(p.sections)}
        sections={p.sections}
        related={p.related.map((slug) => RELACIONADOS[slug]).filter(Boolean)}
      />
    </>
  );
}
