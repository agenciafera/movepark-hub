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
import { itemListSchema, webPageSchema } from "@/lib/jsonld";
import type { FaqIndexItem } from "@/features/faqs/api";
import { buildFaqSections, filterFaqs } from "@/features/faqs/faqIndex.logic";
import { OgImage } from "@/lib/ogImage";
import { SITE_URL } from "@/lib/site";
import {
  LANG_HTML,
  LOCALE_PADRAO,
  caminhoLocalizado,
  clusterHreflang,
  type Locale,
} from "@/lib/i18n";
import { textos } from "@/lib/i18nTextos";

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
/** O que o loader entrega: o acervo já no idioma da página, mais o idioma. */
export type FaqIndexData = { locale: Locale; itens: FaqIndexItem[] } | null;

export default function FaqPage() {
  const data = useLoaderData() as FaqIndexData;
  const locale = data?.locale ?? LOCALE_PADRAO;
  const T = textos(locale);
  // Em idioma traduzido o loader já descartou o que não tem tradução, então esta lista
  // nunca mistura idioma. O slug de cada item também já é o do idioma.
  const todas = data?.itens ?? [];
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

  // O índice existe nos três idiomas, então o cluster é fixo: não depende de tradução
  // por item, e sim da rota, que o build gera para cada idioma.
  const caminhoDoIndice = (l: Locale) => caminhoLocalizado({ familia: "faq", slug: "", locale: l })
    .replace(/\/$/, "");
  const canonical = `${SITE_URL}${caminhoDoIndice(locale)}`;
  const hreflangs = clusterHreflang(
    (["pt-BR", "en", "es"] as Locale[]).map((l) => ({
      locale: l,
      caminho: `${SITE_URL}${caminhoDoIndice(l)}`,
    })),
  );

  const schema = faqJsonLd(sections);
  // Índice das páginas por pergunta (ItemList): é o mapa que buscador e agente
  // usam pra descobrir as URLs /faq/<slug>.
  const paginas = todas.filter((f) => f.slug).map((f) => ({
    name: f.question,
    // A URL de cada item é a DAQUELE idioma: o loader já trocou o slug, e montar com o
    // português aqui devolveria a lista inglesa apontando para páginas em português.
    url: `${SITE_URL}${caminhoLocalizado({ familia: "faq", slug: f.slug as string, locale })}`,
  }));

  return (
    <>
      <Helmet htmlAttributes={{ lang: LANG_HTML[locale] }}>
        <title>{T.faqIndexMetaTitle}</title>
        <meta name="description" content={T.faqIndexMetaDescription} />
        <meta property="og:title" content={T.faqIndexMetaTitle} />
        <meta property="og:description" content={T.faqIndexOgDescription} />
        <meta property="og:url" content={canonical} />
        <link rel="canonical" href={canonical} />
        {hreflangs.map((h) => (
          <link key={h.hreflang} rel="alternate" hrefLang={h.hreflang} href={h.href} />
        ))}
        {schema && <script type="application/ld+json">{JSON.stringify(schema)}</script>}
        {/* Âncora de entidade da página: `@id` próprio e `isPartOf` do site. Sai sempre,
            e não junto da lista: a página existe no grafo mesmo sem item para listar. */}
        <script type="application/ld+json">
          {JSON.stringify(webPageSchema({ url: canonical, name: T.faqIndexMetaTitle, locale }))}
        </script>
        {paginas.length > 0 && (
          <script type="application/ld+json">{JSON.stringify(itemListSchema(paginas))}</script>
        )}
      </Helmet>
      <OgImage area="conteudo" alt={T.ogImageAlt} />

      <ContentPageView
        label={T.faqIndexTitulo}
        title={T.faqIndexTitulo}
        intro={T.faqIndexIntro}
        readMinutes={readingMinutes(sections)}
        sections={sections}
        // As páginas relacionadas existem só em português. Em idioma traduzido o bloco
        // some, pela mesma razão das listas de post do blog: card que promete leitura e
        // entrega outro idioma é pior que a ausência do card.
        related={
          locale === LOCALE_PADRAO
            ? [RELACIONADOS["como-funciona"], RELACIONADOS.cancelamento]
            : []
        }
        bodyTop={
          <>
            <div className="relative mb-6 max-w-xl print:hidden">
              <MagnifyingGlass
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <Input
                placeholder={T.faqIndexBuscar}
                aria-label={T.faqIndexBuscarLabel}
                value={queryDraft}
                onChange={(e) => setQueryDraft(e.target.value)}
                className="pl-9"
              />
            </div>

            {sections.length === 0 && (
              <EmptyState
                title={T.faqIndexNadaEncontrado}
                description={
                  query ? T.faqIndexNadaBateu(query) : T.faqIndexNadaPublicado
                }
              />
            )}
          </>
        }
      />
    </>
  );
}
