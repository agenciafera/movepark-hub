import { Helmet } from "react-helmet-async";
import { ContentPageView } from "@/features/content/ContentPageView";
import { RELACIONADOS, SEGURANCA } from "@/features/content/pages";
import { faqJsonLd } from "@/features/content/jsonld";
import { readingMinutes } from "@/features/content/types";
import { breadcrumbSchema } from "@/lib/jsonld";
import { siteUrl } from "@/lib/site";

/**
 * Segurança e seguro do carro no estacionamento de aeroporto.
 *
 * A objeção número um depois do preço, e o tema em que a auditoria de 24/09/2026
 * mostrou os dois concorrentes com página própria enquanto a Movepark respondia só
 * dentro de uma FAQ de destino.
 *
 * O `FAQPage` sai do mesmo bloco `faq` que a página renderiza, então o dado
 * estruturado repete palavra por palavra o que está na tela (ADR-002).
 */
export default function SegurancaPage() {
  const p = SEGURANCA;
  const url = siteUrl(`/${p.slug}`);
  const titulo = "Estacionamento de aeroporto é seguro? Quem responde pelo seu carro";
  const faq = faqJsonLd(p.sections);

  return (
    <>
      <Helmet>
        <title>{`${titulo} | Movepark`}</title>
        <meta
          name="description"
          content="O estacionamento responde por furto e dano do seu carro, por lei, mesmo sem seguro contratado. Veja a base legal e o que conferir na chegada."
        />
        <meta property="og:title" content={`${titulo} | Movepark`} />
        <meta
          property="og:description"
          content="Quem responde se o carro for furtado no estacionamento do aeroporto, o que muda entre o seguro do pátio e o seu, e os quatro passos na chegada. Veja a base legal."
        />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={url} />
        <link rel="canonical" href={url} />
        <script type="application/ld+json">
          {JSON.stringify(
            breadcrumbSchema([
              { name: "Início", url: siteUrl("/") },
              { name: p.label, url },
            ]),
          )}
        </script>
        {faq && <script type="application/ld+json">{JSON.stringify(faq)}</script>}
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
