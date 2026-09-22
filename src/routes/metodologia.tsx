import * as React from "react";
import { useLoaderData } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ContentPageView } from "@/features/content/ContentPageView";
import { METODOLOGIA, RELACIONADOS } from "@/features/content/pages";
import { comFrescorVivo, type FrescorDestino } from "@/features/content/metodologia.logic";
import { readingMinutes } from "@/features/content/types";
import { siteUrl } from "@/lib/site";

export type MetodologiaData = {
  /** Uma linha por destino precificado, do `destination_price_freshness`. */
  frescor: FrescorDestino[];
};

/**
 * Metodologia: a página de confiança que sustenta a citação. Buscador e LLM
 * decidem quem citar olhando se o número tem origem declarada; aqui a origem
 * é o motor de reservas, e isso está escrito preto no branco.
 *
 * A tabela de datas vem do loader, não do arquivo de conteúdo: é a única seção
 * que envelheceria sozinha, e ela é justamente a que promete não envelhecer.
 * Sem dado (RPC fora do ar no build), a prosa da seção fica de pé sem a tabela.
 */
export default function MetodologiaPage() {
  const data = useLoaderData() as MetodologiaData | null;
  const p = METODOLOGIA;
  const sections = React.useMemo(
    () => comFrescorVivo(p.sections, data?.frescor ?? []),
    [p.sections, data],
  );

  return (
    <>
      <Helmet>
        <title>Metodologia: de onde vem cada preço de estacionamento</title>
        <meta
          name="description"
          content="De onde vem cada preço de estacionamento do site: o motor de reservas, o mesmo do checkout, com distância medida em PostGIS. Veja a fonte campo a campo."
        />
        <meta property="og:title" content="Metodologia: de onde vem cada preço de estacionamento" />
        <meta
          property="og:description"
          content="Preço, distância, traslado e piso de permanência: qual é a origem de cada um, o que a Movepark não publica e por quê, e com que frequência cada tabela muda."
        />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={siteUrl("/metodologia")} />
        <link rel="canonical" href={siteUrl("/metodologia")} />
      </Helmet>

      <ContentPageView
        label={p.label}
        title={p.title}
        intro={p.intro}
        updated={p.updated}
        readMinutes={readingMinutes(sections)}
        sections={sections}
        related={p.related.map((slug) => RELACIONADOS[slug]).filter(Boolean)}
      />
    </>
  );
}
