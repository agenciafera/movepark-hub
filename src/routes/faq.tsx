import * as React from "react";
import { useLoaderData, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/EmptyState";
import { ContentPageView } from "@/features/content/ContentPageView";
import { RELACIONADOS } from "@/features/content/pages";
import { readingMinutes } from "@/features/content/types";
import { faqJsonLd } from "@/features/content/jsonld";
import { itemListSchema } from "@/lib/jsonld";
import type { FaqIndexItem } from "@/features/faqs/api";
import { buildFaqSections, filterFaqs } from "@/features/faqs/faqIndex.logic";
import { OgImage } from "@/lib/ogImage";

const SITE_URL = "https://hub.movepark.co";

/**
 * FAQ com uma seção por categoria (globais) e uma por destino.
 *
 * O acervo vem do loader, então as respostas e o FAQPage (JSON-LD) existem no
 * HTML do build; crawler de IA não executa JS e leria uma página vazia se o
 * conteúdo dependesse de fetch no cliente. A busca filtra em memória.
 *
 * O `?cat=` continua valendo: a Central de Ajuda linka `/faq?cat=pagamentos` e o
 * Manager documenta essa URL. Ele rola até a seção em vez de filtrar.
 */
export default function FaqPage() {
  const todas = (useLoaderData() as FaqIndexItem[] | null) ?? [];
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const [queryDraft, setQueryDraft] = React.useState(query);

  React.useEffect(() => {
    setQueryDraft(query);
  }, [query]);

  // Debounce simples — só altera URL após 300ms
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      const next = new URLSearchParams(params);
      if (queryDraft) next.set("q", queryDraft);
      else next.delete("q");
      if (next.toString() !== params.toString()) {
        setParams(next, { replace: true });
      }
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryDraft]);

  const sections = React.useMemo(
    () => buildFaqSections(filterFaqs(todas, query)),
    [todas, query],
  );

  // `?cat=` vira âncora: o link antigo continua levando ao mesmo lugar.
  const cat = params.get("cat");
  const prontas = sections.length > 0;
  React.useEffect(() => {
    if (!cat || !prontas) return;
    document.getElementById(cat)?.scrollIntoView({ block: "start" });
  }, [cat, prontas]);

  const schema = faqJsonLd(sections);
  // Índice das páginas por pergunta (ItemList): é o mapa que buscador e agente
  // usam pra descobrir as URLs /faq/<slug>.
  const paginas = todas
    .filter((f) => f.slug)
    .map((f) => ({ name: f.question, url: `${SITE_URL}/faq/${f.slug}` }));

  return (
    <>
      <Helmet>
        <title>Perguntas Frequentes | Movepark</title>
        <meta
          name="description"
          content="Tire suas dúvidas sobre reservas, pagamentos, check-in e mais. FAQ completo do Movepark."
        />
        <meta property="og:title" content="Perguntas Frequentes | Movepark" />
        <meta
          property="og:description"
          content="Tire suas dúvidas sobre reservas, pagamentos, check-in e mais."
        />
        <meta property="og:url" content={`${SITE_URL}/faq`} />
        <link rel="canonical" href={`${SITE_URL}/faq`} />
        {schema && <script type="application/ld+json">{JSON.stringify(schema)}</script>}
        {paginas.length > 0 && (
          <script type="application/ld+json">{JSON.stringify(itemListSchema(paginas))}</script>
        )}
      </Helmet>
      <OgImage area="conteudo" />

      <ContentPageView
        label="Perguntas frequentes"
        title="Perguntas frequentes"
        intro="Reservas, pagamentos e check-in, com as respostas que o suporte mais repete."
        readMinutes={readingMinutes(sections)}
        sections={sections}
        related={[RELACIONADOS["como-funciona"], RELACIONADOS.cancelamento]}
        bodyTop={
          <>
            <div className="relative mb-6 max-w-xl print:hidden">
              <MagnifyingGlass
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <Input
                placeholder="Buscar pergunta…"
                aria-label="Buscar pergunta"
                value={queryDraft}
                onChange={(e) => setQueryDraft(e.target.value)}
                className="pl-9"
              />
            </div>

            {sections.length === 0 && (
              <EmptyState
                title="Nenhuma pergunta encontrada"
                description={
                  query
                    ? `Nada bateu com "${query}". Tente outra palavra ou fale com o suporte.`
                    : "As perguntas ainda não foram publicadas."
                }
              />
            )}
          </>
        }
      />
    </>
  );
}
