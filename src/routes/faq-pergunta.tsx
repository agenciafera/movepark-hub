import { Link, useLoaderData } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CaretRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { PostBody } from "@/features/blog/PostBody";
import { formatUpdated } from "@/features/content/types";
import { metaDescriptionFrom } from "@/features/faqs/faqIndex.logic";
import {
  aeroportoEmProsa,
  introDaPergunta,
  keywordDoTitulo,
  shortSemCodigo,
  type FaqPrecoContexto,
} from "@/features/faqs/faqPagina.logic";
import type { FaqPageData } from "@/features/faqs/api";
import { durationLabel } from "@/features/price-index/priceIndex.logic";
import { formatBRL } from "@/lib/format";
import { breadcrumbSchema, faqSchema } from "@/lib/jsonld";
import { OgImage } from "@/lib/ogImage";
import { SITE_URL } from "@/lib/site";

/** O que o loader entrega: a pergunta, as relacionadas e o contexto de preço. */
export type FaqPerguntaData = (FaqPageData & { precos: FaqPrecoContexto }) | null;

/** O que conferir antes de reservar, onde a reserva fecha pela Movepark. */
const CHECKLIST = [
  "Vaga coberta ou descoberta: a coberta protege de sol e chuva, a descoberta costuma ter a menor diária.",
  "Traslado até o terminal: confirme se está incluído e de quanto em quanto tempo sai.",
  "Distância e tempo até o embarque: estão na página de cada estacionamento.",
  "Cancelamento e tolerância de horário: a política aparece antes de fechar a reserva.",
];

/**
 * Variante pra aeroporto sem parceiro precificado: a reserva fecha direto com o
 * estacionamento, então o checklist não pode apontar pra página de oferta da
 * Movepark (coerência da página, e ADR-009: sem promessa de transação).
 */
const CHECKLIST_SEM_PARCEIRO = [
  "Vaga coberta ou descoberta: a coberta protege de sol e chuva, a descoberta costuma ter a menor diária.",
  "Traslado até o terminal: confirme se está incluído e de quanto em quanto tempo sai.",
  "Distância até o terminal: os estacionamentos mapeados estão na página do aeroporto.",
  "Cancelamento e tolerância de horário: confirme a política na cotação, antes de pagar.",
];

/**
 * Página de uma pergunta do FAQ (/faq/<slug>), no formato answer-first: a
 * resposta curta abre a página e as seções de contexto aprofundam com dado real
 * (preços do motor, contagem de parceiros), nunca com promessa vazia.
 *
 * Cada pergunta com URL própria é uma unidade citável, e a palavra-chave de
 * tráfego de aeroporto ("estacionamento aeroporto guarulhos") sai no title e no
 * primeiro parágrafo. Pré-renderizada no build (loader + getStaticPaths).
 */
export default function FaqPerguntaPage() {
  const data = useLoaderData() as FaqPerguntaData;

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <EmptyState
          title="Pergunta não encontrada"
          description="Essa pergunta não existe ou saiu do ar."
          action={
            <Link to="/faq" className="text-mp-primary underline">
              Ver todas as perguntas
            </Link>
          }
        />
      </div>
    );
  }

  const { faq, related, precos } = data;
  const destino = faq.destination;
  const destinoCurto = destino ? shortSemCodigo(destino.short_name, destino.name) : null;
  const canonical = `${SITE_URL}/faq/${faq.slug}`;
  const keyword = keywordDoTitulo(destino);
  const title = `${faq.question} · ${keyword} | Movepark`;
  const description = `${keyword}: ${metaDescriptionFrom(faq.answer, 120)}`;
  const contexto = destino ? (destino.short_name ?? destino.name) : (faq.category?.label ?? "Geral");

  const precoDestino = precos?.kind === "destino" ? precos.destino : null;
  const precoRede = precos?.kind === "rede" ? precos.rede : null;
  const diaria1 = precoDestino?.byDuration.find((d) => d.days === 1) ?? null;
  // Aeroporto sem parceiro precificado: a página não pode prometer reserva pela
  // Movepark (coerência com a resposta rápida, e ADR-009). As seções de fechamento
  // e os CTAs mudam de contexto junto. O sinal é a ausência de preço do motor,
  // mesmo que o destino apareça no índice só com lotes mapeados.
  const semParceiro = Boolean(
    destino && (!precoDestino || precoDestino.byDuration.length === 0),
  );
  // Os blocos de preço e de fechamento (como reservar/escolher + checklist) só
  // entram onde preço É o assunto da pergunta (categoria "pagamentos"). Nas
  // demais, quem sustenta a página é o corpo específico da pergunta (body_md);
  // bloco genérico depois da resposta rápida quebra o contexto e dilui SEO/GEO.
  const paginaDePreco = faq.category?.slug === "pagamentos";
  const intro = introDaPergunta(
    destino,
    !paginaDePreco ? "detalhes" : semParceiro ? "comparativo" : "precos",
  );

  // Um único FAQPage por página (ADR-002), com a resposta idêntica à visível na
  // "Resposta rápida". O dateModified diz quando a resposta foi revisada.
  const schema = {
    ...faqSchema([{ question: faq.question, answer: faq.answer }]),
    dateModified: faq.updated_at,
  };
  const breadcrumb = breadcrumbSchema([
    { name: "Início", url: SITE_URL },
    { name: "Perguntas frequentes", url: `${SITE_URL}/faq` },
    { name: faq.question, url: canonical },
  ]);

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <script type="application/ld+json">{JSON.stringify(schema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumb)}</script>
      </Helmet>
      <OgImage area="conteudo" />

      <article className="mx-auto w-full max-w-3xl px-4 py-8 tablet:py-12">
        {/* Breadcrumb visível (espelha o BreadcrumbList do JSON-LD) */}
        <nav aria-label="Trilha de navegação" className="mb-4">
          <ol className="flex flex-wrap items-center gap-1.5 text-body-sm text-muted">
            <li>
              <Link to="/" className="hover:text-ink">
                Início
              </Link>
            </li>
            <li aria-hidden className="text-muted-steel">
              ›
            </li>
            <li>
              <Link to="/faq" className="hover:text-ink">
                Perguntas frequentes
              </Link>
            </li>
            <li aria-hidden className="text-muted-steel">
              ›
            </li>
            <li aria-current="page" className="text-ink">
              {contexto}
            </li>
          </ol>
        </nav>

        <header>
          <h1 className="text-balance text-display-xl text-ink">{faq.question}</h1>
          {/* Primeiro parágrafo da página: é aqui que a palavra-chave de tráfego
              de aeroporto aparece em texto corrido. */}
          <p className="mt-3 text-pretty text-body-md text-muted">{intro}</p>
          <p className="mt-2 text-caption-sm text-muted">
            Atualizado em{" "}
            <time dateTime={faq.updated_at}>{formatUpdated(faq.updated_at)}</time>
          </p>
        </header>

        {/* Resposta rápida: o parágrafo que responde sozinho, antes de qualquer
            aprofundamento. É o trecho que buscador e IA extraem. */}
        <section className="mt-6 rounded-lg bg-mp-pale p-5 tablet:p-6">
          <h2 className="text-title-md text-ink">Resposta rápida</h2>
          <p className="mt-2 whitespace-pre-wrap text-body-md leading-[1.65] text-body">
            {faq.answer}
          </p>
        </section>

        {/* Corpo expandido (opcional): markdown editado no Manager. */}
        {faq.body_md && (
          <section className="mt-8">
            <PostBody markdown={faq.body_md} />
          </section>
        )}

        {/* Quanto custa: dado real do índice de preços (motor de reservas), o
            mesmo publicado em /precos. Sem dado, a seção não existe (ADR-009:
            nada de número inventado num HTML congelado). Só em página de preço:
            fora dela, a tabela quebraria o contexto da pergunta. */}
        {paginaDePreco && destino && precoDestino && precoDestino.byDuration.length > 0 && (
          <section className="mt-8">
            <h2 className="text-display-sm text-ink">
              Quanto custa estacionar no {aeroportoEmProsa(destino)}
            </h2>
            <p className="mt-2 text-body-md text-body">
              {diaria1
                ? `A diária nos estacionamentos parceiros perto do ${aeroportoEmProsa(destino)} começa em ${formatBRL(diaria1.from)}, e o valor por dia cai conforme a estadia.`
                : `O valor por dia cai conforme a estadia nos estacionamentos parceiros perto do ${aeroportoEmProsa(destino)}.`}{" "}
              Os preços saem do motor de reservas, os mesmos do checkout.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-body-sm">
                <thead>
                  <tr className="border-b border-hairline text-muted">
                    <th className="py-2 pr-4 font-medium">Período</th>
                    <th className="py-2 pr-4 font-medium">Total a partir de</th>
                    <th className="py-2 font-medium">Por dia</th>
                  </tr>
                </thead>
                <tbody>
                  {precoDestino.byDuration.map((d) => (
                    <tr key={d.days} className="border-b border-hairline-soft">
                      <td className="py-2 pr-4 text-ink">{durationLabel(d.days)}</td>
                      <td className="py-2 pr-4 text-ink">{formatBRL(d.from)}</td>
                      <td className="py-2 text-body">{formatBRL(d.fromPerDay)}/dia</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-body-sm text-muted">
              {precoDestino.unitCount}{" "}
              {precoDestino.unitCount === 1 ? "estacionamento" : "estacionamentos"} de{" "}
              {precoDestino.partnerCount}{" "}
              {precoDestino.partnerCount === 1 ? "parceiro" : "parceiros"} no comparativo.{" "}
              <Link
                to={`/precos/${precoDestino.slug}`}
                className="font-medium text-mp-indigo underline-offset-2 hover:underline"
              >
                Ver a tabela completa de preços
              </Link>
            </p>
          </section>
        )}

        {/* Versão de rede pras perguntas gerais de preço: números da plataforma. */}
        {paginaDePreco && !destino && precoRede && (
          <section className="mt-8">
            <h2 className="text-display-sm text-ink">
              Estacionamento de aeroporto com a Movepark
            </h2>
            <p className="mt-2 text-body-md text-body">
              São {precoRede.unitCount} estacionamentos comparados em{" "}
              {precoRede.destinationCount} destinos
              {precoRede.minDailyFrom != null
                ? `, com diária a partir de ${formatBRL(precoRede.minDailyFrom)}`
                : ""}
              . O preço mostrado é o preço final da reserva, sem taxa na chegada.{" "}
              <Link
                to="/precos"
                className="font-medium text-mp-indigo underline-offset-2 hover:underline"
              >
                Ver o índice de preços
              </Link>
            </p>
          </section>
        )}

        {/* Fechamento em contexto, só nas páginas de preço (é onde a decisão de
            reserva é o assunto): onde há parceiro, o passo a passo da reserva
            pela Movepark; onde não há, como escolher fechando direto com o
            estacionamento (sem prometer uma reserva que não existe ali). */}
        {paginaDePreco &&
          (destino && semParceiro ? (
          <section className="mt-8">
            <h2 className="text-display-sm text-ink">
              Como escolher o estacionamento no {aeroportoEmProsa(destino)}
            </h2>
            <p className="mt-2 text-body-md text-body">
              Neste aeroporto a reserva é fechada direto com o estacionamento. A página do{" "}
              {aeroportoEmProsa(destino)} mapeia os da região, com endereço, telefone e
              avaliação do Google: cote dois ou três, compare o total do período e confirme o
              traslado antes de pagar.
            </p>
          </section>
        ) : (
          <section className="mt-8">
            <h2 className="text-display-sm text-ink">Como reservar com a Movepark</h2>
            <p className="mt-2 text-body-md text-body">
              Você busca pelo aeroporto, compara preço, tipo de vaga e avaliação dos
              estacionamentos credenciados e reserva online, com o valor fechado antes de pagar.
              Na maioria das unidades o traslado até o terminal está incluído.
            </p>
          </section>
        ))}

        {/* Checklist do que olhar antes de decidir, também só onde a decisão de
            preço é o assunto da página. */}
        {paginaDePreco && (
          <section className="mt-8">
            <h2 className="text-display-sm text-ink">O que conferir antes de reservar</h2>
            <ul className="mt-3 space-y-2">
              {(semParceiro ? CHECKLIST_SEM_PARCEIRO : CHECKLIST).map((item) => (
                <li key={item} className="flex items-start gap-2 text-body-md text-body">
                  <CaretRight className="mt-1 h-4 w-4 shrink-0 text-mp-primary" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Dois CTAs em contexto: com parceiro, reservar e comparar preços; sem
            parceiro, ver o mapa da região e comparar em outros aeroportos. */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          {destino ? (
            semParceiro ? (
              <>
                <Button asChild>
                  <Link to={`/destinos/${destino.slug}`}>
                    Ver estacionamentos em {destinoCurto}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/precos">Comparar preços em outros aeroportos</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild>
                  <Link to={`/destinos/${destino.slug}`}>Reservar vaga em {destinoCurto}</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to={`/precos/${destino.slug}`}>Comparar preços em {destinoCurto}</Link>
                </Button>
              </>
            )
          ) : (
            <>
              <Button asChild>
                <Link to="/search">Buscar estacionamento</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/precos">Comparar preços</Link>
              </Button>
            </>
          )}
        </div>

        {related.length > 0 && (
          <section className="mt-10 border-t border-hairline pt-8">
            <h2 className="text-display-sm text-ink">Perguntas relacionadas</h2>
            <ul className="mt-4 space-y-3">
              {related.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/faq/${r.slug}`}
                    className="group inline-flex items-start gap-2 text-body-md text-ink hover:text-mp-primary"
                  >
                    <CaretRight
                      className="mt-1 h-4 w-4 shrink-0 text-muted transition group-hover:text-mp-primary"
                      aria-hidden
                    />
                    {r.question}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-8">
          <Link
            to="/faq"
            className="text-body-sm font-medium text-mp-indigo underline-offset-2 hover:underline"
          >
            Todas as perguntas frequentes
          </Link>
        </div>
      </article>
    </>
  );
}
