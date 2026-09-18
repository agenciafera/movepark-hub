import { Helmet } from "react-helmet-async";
import { ContentPageView } from "@/features/content/ContentPageView";
import { GRUPO, RELACIONADOS } from "@/features/content/pages";
import { readingMinutes } from "@/features/content/types";
import { breadcrumbSchema, organizationSchema } from "@/lib/jsonld";
import { siteUrl } from "@/lib/site";

const META =
  "Os quatro produtos da Movepark: o Hub de reserva de vaga, a Go2Park de rastreio da van, a Go2Med e o Coopark. O que cada um faz, em que estágio está e quem responde por ele.";

/**
 * A página do grupo.
 *
 * Ela carrega a mesma entidade Organization da home, agora com as quatro marcas
 * em `brand`: é aqui que o vínculo entre os nomes passa a existir para buscador e
 * LLM. Até então a Go2Park só aparecia como selo em três unidades, e nenhuma
 * superfície de máquina dizia que ela era da casa.
 *
 * O conteúdo mora em `features/content/pages.ts`, e o gêmeo Markdown em
 * `public/grupo.md` (o teste reprova se os dois divergirem). Ver
 * docs/specs/grupo-movepark.md.
 */
export default function GrupoPage() {
  const { "@context": _orgCtx, ...orgEntidade } = organizationSchema();
  const aboutSchema = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: GRUPO.title,
    description: META,
    url: siteUrl("/grupo"),
    mainEntity: orgEntidade,
  };

  return (
    <>
      <Helmet>
        <title>O grupo Movepark | Movepark</title>
        <meta name="description" content={META} />
        <meta property="og:title" content="O grupo Movepark" />
        <meta property="og:description" content={META} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={siteUrl("/grupo")} />
        <link rel="canonical" href={siteUrl("/grupo")} />
        <script type="application/ld+json">{JSON.stringify(aboutSchema)}</script>
        <script type="application/ld+json">
          {JSON.stringify(
            breadcrumbSchema([
              { name: "Início", url: siteUrl("/") },
              { name: GRUPO.label, url: siteUrl("/grupo") },
            ]),
          )}
        </script>
      </Helmet>

      <ContentPageView
        label={GRUPO.label}
        title={GRUPO.title}
        intro={GRUPO.intro}
        updated={GRUPO.updated}
        readMinutes={readingMinutes(GRUPO.sections)}
        sections={GRUPO.sections}
        related={GRUPO.related.map((slug) => RELACIONADOS[slug]).filter(Boolean)}
      />
    </>
  );
}
