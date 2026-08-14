import { Link, useLoaderData } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CaretRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { PostBody } from "@/features/blog/PostBody";
import { formatUpdated } from "@/features/content/types";
import { metaDescriptionFrom } from "@/features/faqs/faqIndex.logic";
import type { FaqPageData } from "@/features/faqs/api";
import { breadcrumbSchema, faqSchema } from "@/lib/jsonld";

const SITE_URL = "https://hub.movepark.co";

/**
 * Página de uma pergunta do FAQ (/faq/<slug>), no formato answer-first: a
 * resposta curta abre a página, o corpo expandido (quando existe) aprofunda.
 *
 * Cada pergunta com URL própria é uma unidade citável: buscador ranqueia a
 * long-tail e o agente de IA cita o endereço exato em vez de "o FAQ do site".
 * Pré-renderizada no build (loader + getStaticPaths em routes.tsx).
 */
export default function FaqPerguntaPage() {
  const data = useLoaderData() as FaqPageData | null;

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

  const { faq, related } = data;
  const destino = faq.destination;
  const destinoNome = destino ? (destino.short_name ?? destino.name) : null;
  const canonical = `${SITE_URL}/faq/${faq.slug}`;
  const description = metaDescriptionFrom(faq.answer);
  const contexto = destinoNome ?? faq.category?.label ?? "Geral";

  // Um único FAQPage por página (ADR-002), aqui com uma pergunta só. O
  // dateModified diz ao leitor de máquina quando a resposta foi revisada.
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
        <title>{`${faq.question} | Movepark`}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={`${faq.question} | Movepark`} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <script type="application/ld+json">{JSON.stringify(schema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumb)}</script>
      </Helmet>

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
          <p className="mt-3 text-caption-sm text-muted">
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

        {/* CTA por escopo: pergunta de destino leva pro destino; geral, pra busca. */}
        <div className="mt-8 flex flex-wrap items-center gap-4">
          {destino ? (
            <Button asChild>
              <Link to={`/destinos/${destino.slug}`}>Estacionamentos em {destinoNome}</Link>
            </Button>
          ) : (
            <Button asChild>
              <Link to="/search">Buscar estacionamento</Link>
            </Button>
          )}
          <Link
            to="/faq"
            className="text-body-sm font-medium text-mp-indigo underline-offset-2 hover:underline"
          >
            Todas as perguntas frequentes
          </Link>
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
      </article>
    </>
  );
}
