import { Helmet } from "react-helmet-async";
import { ContentPageView } from "@/features/content/ContentPageView";
import { CANCELAMENTO, RELACIONADOS } from "@/features/content/pages";
import { readingMinutes } from "@/features/content/types";

export default function CancelamentoPage() {
  const p = CANCELAMENTO;
  return (
    <>
      <Helmet>
        <title>Política de Cancelamento | Movepark</title>
        <meta
          name="description"
          content="Regras de cancelamento e reembolso da Movepark: o prazo depende da sua Tarifa, com reembolso integral dentro da janela."
        />
        <meta property="og:title" content="Política de Cancelamento | Movepark" />
        <meta property="og:url" content="https://hub.movepark.co/cancelamento" />
        <link rel="canonical" href="https://hub.movepark.co/cancelamento" />
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
