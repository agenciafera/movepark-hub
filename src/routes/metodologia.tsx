import { Helmet } from "react-helmet-async";
import { ContentPageView } from "@/features/content/ContentPageView";
import { METODOLOGIA, RELACIONADOS } from "@/features/content/pages";
import { readingMinutes } from "@/features/content/types";

/**
 * Metodologia: a página de confiança que sustenta a citação. Buscador e LLM
 * decidem quem citar olhando se o número tem origem declarada; aqui a origem
 * é o motor de reservas, e isso está escrito preto no branco.
 */
export default function MetodologiaPage() {
  const p = METODOLOGIA;
  return (
    <>
      <Helmet>
        <title>Metodologia: de onde vêm os preços da Movepark</title>
        <meta
          name="description"
          content="Os preços do site saem do motor de reservas, os mesmos do checkout. Como ordenamos resultados, o que é parceiro e mapeado, e de onde vêm as avaliações."
        />
        <meta property="og:title" content="Metodologia: de onde vêm os preços da Movepark" />
        <meta property="og:url" content="https://hub.movepark.co/metodologia" />
        <link rel="canonical" href="https://hub.movepark.co/metodologia" />
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
