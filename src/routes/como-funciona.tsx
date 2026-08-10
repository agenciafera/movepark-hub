import { Helmet } from "react-helmet-async";
import { ContentPageView } from "@/features/content/ContentPageView";
import { COMO_FUNCIONA, RELACIONADOS } from "@/features/content/pages";
import { readingMinutes } from "@/features/content/types";
import { howToJsonLd } from "@/features/content/jsonld";

export default function ComoFuncionaPage() {
  const p = COMO_FUNCIONA;
  return (
    <>
      <Helmet>
        <title>Como Funciona | Movepark</title>
        <meta
          name="description"
          content="Entenda como a Movepark funciona: busque, reserve online, chegue ao estacionamento e faça check-in com QR Code. Simples assim."
        />
        <meta property="og:title" content="Como Funciona | Movepark" />
        <meta property="og:url" content="https://hub.movepark.co/como-funciona" />
        <link rel="canonical" href="https://hub.movepark.co/como-funciona" />
        <script type="application/ld+json">{JSON.stringify(howToJsonLd(p))}</script>
      </Helmet>

      <ContentPageView
        label={p.label}
        title={p.title}
        intro={p.intro}
        updated={p.updated}
        readMinutes={readingMinutes(p.sections)}
        sections={p.sections}
        related={p.related.map((slug) => RELACIONADOS[slug]).filter(Boolean)}
        primaryCta={{ label: "Buscar estacionamento", to: "/" }}
      />
    </>
  );
}
