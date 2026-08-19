import * as React from "react";

import { Breadcrumb, type Trilha } from "@/components/shared/Breadcrumb";
import { Button } from "@/components/ui/button";
import { imageSrcSet, optimizedImageUrl } from "@/lib/storage";

/**
 * Abertura da página de destino (`/destinos/<slug>`), no desenho do Claude Design
 * ("Página de destino Movepark").
 *
 * A foto era um bloco no meio da página, abaixo de um cabeçalho branco: quem abria
 * `/destinos/aeroporto-de-guarulhos` via primeiro um h1 solto e só depois descobria
 * onde estava. Aqui a foto é a abertura, e sobre ela ficam as três coisas que a
 * pessoa procura antes de rolar: onde é, quanto custa e por onde começar.
 *
 * Três decisões que não são estéticas:
 *
 * - **Sem foto, a faixa é a da marca** (`bg-dashboard-hero`), nunca uma paisagem
 *   genérica de aeroporto. Paisagem afirma geografia, e foto de aeroporto que não é
 *   aquele aeroporto engana mesmo sendo ilustrativa. É a mesma razão do `OgImage`.
 * - **O destaque do canto é só o preço "a partir de", que é fato do catálogo.**
 *   Promessa de transação (cancelamento, vaga garantida, cupom) não entra aqui:
 *   depende de capacidade da unidade, e a abertura fala do destino inteiro (ADR-009).
 * - **O `highlights` recebe frase pronta e não monta nenhuma.** Quem sabe se o
 *   destino tem parceiro, quantos lotes mapeados existem e qual é a menor distância
 *   medida é a página; o componente só desenha.
 */

export type DestinationHeroDestaque = {
  /** Rótulo curto acima do número ("A partir de"). */
  rotulo: string;
  valor: React.ReactNode;
  /** Complemento do valor, em cinza ("/ diária"). */
  sufixo?: string;
  cta: { label: string; href: string };
};

type Props = {
  trilha: Trilha[];
  /** Cidade e estado, o rótulo pequeno acima do h1. */
  eyebrow: string;
  heading: string;
  /** Fatos do destino, separados por ponto. Vazio some. */
  highlights?: string[];
  heroUrl: string | null;
  alt: string;
  destaque?: DestinationHeroDestaque | null;
};

export function DestinationHero({
  trilha,
  eyebrow,
  heading,
  highlights = [],
  heroUrl,
  alt,
  destaque,
}: Props) {
  return (
    <section className="relative isolate overflow-hidden">
      {heroUrl ? (
        <>
          <img
            src={optimizedImageUrl(heroUrl, { width: 1600 })}
            srcSet={imageSrcSet(heroUrl, [768, 1280, 1920])}
            sizes="100vw"
            alt={alt}
            className="absolute inset-0 h-full w-full object-cover"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
          {/* Escurece o topo (para a trilha) e o rodapé (para o h1 e o cartão),
              deixando o meio da foto respirar. Os valores são os do desenho. */}
          <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(180deg,rgba(41,38,63,0.62)_0%,rgba(41,38,63,0.22)_38%,rgba(41,38,63,0.86)_100%)]"
          />
        </>
      ) : (
        <div aria-hidden className="bg-dashboard-hero absolute inset-0" />
      )}

      <div className="relative mx-auto flex min-h-[420px] w-full max-w-[1280px] flex-col justify-between gap-10 px-4 pb-10 pt-6 desktop:min-h-[460px] desktop:px-8 desktop:pb-12">
        <Breadcrumb items={trilha} tom="escuro" />

        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
          <div className="flex max-w-[720px] flex-col gap-3">
            <span className="text-badge uppercase tracking-[0.4px] text-mp-teal">{eyebrow}</span>
            <h1 className="text-balance text-display-3xl text-white">{heading}</h1>
            {highlights.length > 0 && (
              /* Empilhado no mobile e em linha a partir do tablet. Em linha só, o
                 separador quebrava para o começo da linha de baixo e virava um marcador
                 de lista que o primeiro item não tinha. */
              <ul className="flex flex-col gap-1 text-body-sm text-white tablet:flex-row tablet:flex-wrap tablet:items-center tablet:gap-x-2">
                {highlights.map((h, i) => (
                  <li key={h} className="flex items-center gap-2">
                    {i > 0 && (
                      <span aria-hidden className="hidden text-white/60 tablet:inline">
                        ·
                      </span>
                    )}
                    {h}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {destaque && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-lg bg-canvas p-5 shadow-tier">
              <span className="flex flex-col gap-0.5">
                <span className="text-caption-sm text-muted">{destaque.rotulo}</span>
                <span className="text-display-sm tabular-nums text-ink">
                  {destaque.valor}
                  {destaque.sufixo && (
                    <span className="text-body-sm text-muted"> {destaque.sufixo}</span>
                  )}
                </span>
              </span>
              <Button asChild>
                <a href={destaque.cta.href}>{destaque.cta.label}</a>
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
