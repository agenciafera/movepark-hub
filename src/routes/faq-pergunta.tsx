import { Link, useLoaderData, useLocation } from "react-router-dom";
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
  type FaqDestinoRef,
  type FaqPrecoContexto,
} from "@/features/faqs/faqPagina.logic";
import type { FaqPageData } from "@/features/faqs/api";
import { buildMetaDescription, pickTitle, priceHook } from "@/lib/seo";
import { formatBRL } from "@/lib/format";
import { breadcrumbSchema, faqSchema } from "@/lib/jsonld";
import { OgImage } from "@/lib/ogImage";
import { SITE_URL } from "@/lib/site";
import { caminhoDestino, caminhoPrecos } from "@/lib/urls";
import {
  LANG_HTML,
  LOCALE_PADRAO,
  caminhoLocalizado,
  clusterHreflang,
  localeDoCaminho,
  type Locale,
} from "@/lib/i18n";
import type { IdiomaDaFaq } from "@/features/faqs/i18nApi";
import { textos } from "@/lib/i18nTextos";

/** O que o loader entrega: a pergunta, as relacionadas e o contexto de preço. */
export type FaqPerguntaData =
  | (FaqPageData & {
      precos: FaqPrecoContexto;
      destinoLabel?: string | null;
      destinoSlug?: string | null;
    })
  | null;

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
  // O estado vazio roda ANTES de existir `data`, então o idioma não pode vir do loader.
  // Vem do caminho, que é a mesma fonte que o loader usa, e por isso não diverge dele.
  const { pathname } = useLocation();

  if (!data) {
    const TVazio = textos(localeDoCaminho(pathname).locale);
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <EmptyState
          title={TVazio.faqNaoEncontrada}
          description={TVazio.faqNaoEncontradaTexto}
          action={
            <Link to="/faq" className="text-mp-primary underline">
              {TVazio.faqVerTodas}
            </Link>
          }
        />
      </div>
    );
  }

  const { faq, related, precos } = data;
  /*
   * Em idioma traduzido a pergunta, a resposta e o corpo vêm da tradução; o resto da
   * página (destino, preços, relacionadas) continua saindo do registro original,
   * porque é dado, não texto.
   */
  const locale: Locale = (data as { locale?: Locale }).locale ?? LOCALE_PADRAO;
  const traducao = (data as { traducao?: { question: string; answer: string; body_md: string | null; slug: string } | null }).traducao ?? null;
  const idiomas = ((data as { idiomas?: IdiomaDaFaq[] }).idiomas ?? []);
  const T = textos(locale);
  const pergunta = traducao?.question ?? faq.question;
  const resposta = traducao?.answer ?? faq.answer;
  const corpo = traducao ? traducao.body_md : faq.body_md;

  const destino = faq.destination;
  // Rótulo do aeroporto no idioma da página: em português sai dos helpers, e em
  // idioma traduzido do `seo_label` que o loader trouxe. `aeroportoEmProsa` monta
  // "Aeroporto de <curto>", que em inglês viraria "Aeroporto de Guarulhos Airport".
  const destinoLabel = data?.destinoLabel ?? null;
  const destinoCurto = destinoLabel
    ? shortSemCodigo(destinoLabel, destinoLabel)
    : destino
      ? shortSemCodigo(destino.short_name, destino.name)
      : null;
  const aeroportoLabel = (d: FaqDestinoRef) => destinoLabel ?? aeroportoEmProsa(d);
  // O link do destino acompanha o idioma quando a página traduzida existe. Quando não
  // existe, aponta para a portuguesa: página em outro idioma é melhor que link morto.
  const linkDestino = (d: FaqDestinoRef) =>
    data?.destinoSlug && locale !== LOCALE_PADRAO
      ? caminhoLocalizado({ familia: "destino", slug: data.destinoSlug, locale })
      : caminhoDestino(d.public_slug ?? d.slug);
  const canonical =
    locale === LOCALE_PADRAO
      ? `${SITE_URL}/faq/${faq.slug}`
      : `${SITE_URL}${caminhoLocalizado({ familia: "faq", slug: traducao!.slug, locale })}`;
  // Cluster com o slug de CADA idioma. É a regra que virou lei depois do hreflang que
  // foi a produção apontando para 404: a URL de um idioma só se monta com o slug dele.
  const hreflangs = clusterHreflang([
    { locale: LOCALE_PADRAO, caminho: `${SITE_URL}/faq/${faq.slug}` },
    ...idiomas.map((i) => ({
      locale: i.locale,
      caminho: `${SITE_URL}${caminhoLocalizado({ familia: "faq", slug: i.slug, locale: i.locale })}`,
    })),
  ]);
  const keyword = keywordDoTitulo(destino);
  // A pergunta é o que a pessoa digitou: ela fica inteira, e o que sai quando a frase
  // estoura é o sufixo, primeiro a marca e depois a palavra-chave do destino.
  const title = pickTitle(
    `${pergunta} · ${keyword} | Movepark`,
    `${pergunta} · ${keyword}`,
    `${pergunta} | Movepark`,
    pergunta,
  );
  // O corte fino fica com `buildMetaDescription`, que sabe quanto espaço sobra depois do
  // preço e do CTA. Aqui só tiramos a marcação e as frases que não caberiam de jeito nenhum.
  const resumoResposta = metaDescriptionFrom(resposta, 120);
  const contexto = destino ? (destino.short_name ?? destino.name) : (faq.category?.label ?? "Geral");

  const precoDestino = precos?.kind === "destino" ? precos.destino : null;
  const precoRede = precos?.kind === "rede" ? precos.rede : null;
  const diaria1 = precoDestino?.byDuration.find((d) => d.days === 1) ?? null;
  // Estrutura única da description: palavra-chave, resposta curta, menor preço do destino e
  // CTA. O resumo entra colado na palavra-chave (e não como complemento) para nunca ser o
  // primeiro a sair quando a frase estoura: numa página de FAQ, a resposta é o snippet.
  const description = buildMetaDescription({
    keyword,
    fill: resumoResposta,
    price: priceHook(diaria1?.from ?? null),
    cta: diaria1 ? "comparar" : "conferir",
  });
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
  // Em português a intro segue vindo de `introDaPergunta`, que VARIA por categoria
  // (detalhes, comparativo ou preços) e é decisão editorial. O dicionário serve aos
  // idiomas traduzidos, onde ainda não existe essa variação. Achatar as três numa só
  // apagaria a distinção sem ninguém notar, que foi o erro cometido com os
  // cabeçalhos do destino e pego pelo teste de contrato.
  const intro =
    locale === LOCALE_PADRAO
      ? introDaPergunta(destino, !paginaDePreco ? "detalhes" : semParceiro ? "comparativo" : "precos")
      : T.faqIntro(destinoCurto);

  // Um único FAQPage por página (ADR-002), com a resposta idêntica à visível na
  // "Resposta rápida". O dateModified diz quando a resposta foi revisada.
  const schema = {
    ...faqSchema([{ question: pergunta, answer: resposta }]),
    dateModified: faq.updated_at,
  };
  const breadcrumb = breadcrumbSchema([
    { name: "Início", url: SITE_URL },
    { name: "Perguntas frequentes", url: `${SITE_URL}/faq` },
    { name: pergunta, url: canonical },
  ]);

  return (
    <>
      <Helmet htmlAttributes={{ lang: LANG_HTML[locale] }}>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        {hreflangs.map((h) => (
          <link key={h.hreflang} rel="alternate" hrefLang={h.hreflang} href={h.href} />
        ))}
        <meta property="og:type" content="article" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <script type="application/ld+json">{JSON.stringify(schema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumb)}</script>
      </Helmet>
      <OgImage area="conteudo" alt={T.ogImageAlt} />

      <article className="mx-auto w-full max-w-3xl px-4 py-8 tablet:py-12">
        {/* Breadcrumb visível (espelha o BreadcrumbList do JSON-LD) */}
        <nav aria-label="Trilha de navegação" className="mb-4">
          <ol className="flex flex-wrap items-center gap-1.5 text-body-sm text-muted">
            <li>
              <Link to="/" className="hover:text-ink">
                {T.trilhaInicio}
              </Link>
            </li>
            <li aria-hidden className="text-muted-steel">
              ›
            </li>
            <li>
              <Link to="/faq" className="hover:text-ink">
                {T.faqTrilha}
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
          <h1 className="text-balance text-display-xl text-ink">{pergunta}</h1>
          {/* Primeiro parágrafo da página: é aqui que a palavra-chave de tráfego
              de aeroporto aparece em texto corrido. */}
          <p className="mt-3 text-pretty text-body-md text-muted">{intro}</p>
          <p className="mt-2 text-caption-sm text-muted">
            {T.faqAtualizado}{" "}
            <time dateTime={faq.updated_at}>
              {formatUpdated(faq.updated_at, T.intlLocale)}
            </time>
          </p>
        </header>

        {/* Resposta rápida: o parágrafo que responde sozinho, antes de qualquer
            aprofundamento. É o trecho que buscador e IA extraem. */}
        <section className="mt-6 rounded-lg bg-mp-pale p-5 tablet:p-6">
          <h2 className="text-title-md text-ink">{T.faqRespostaRapida}</h2>
          <p className="mt-2 whitespace-pre-wrap text-body-md leading-[1.65] text-body">
            {resposta}
          </p>
        </section>

        {/* Corpo expandido (opcional): markdown editado no Manager. */}
        {corpo && (
          <section className="mt-8">
            <PostBody markdown={corpo} />
          </section>
        )}

        {/* Quanto custa: dado real do índice de preços (motor de reservas), o
            mesmo publicado em /precos. Sem dado, a seção não existe (ADR-009:
            nada de número inventado num HTML congelado). Só em página de preço:
            fora dela, a tabela quebraria o contexto da pergunta. */}
        {paginaDePreco && destino && precoDestino && precoDestino.byDuration.length > 0 && (
          <section className="mt-8">
            <h2 className="text-display-sm text-ink">
              {T.faqPrecoHeading(aeroportoLabel(destino))}
            </h2>
            <p className="mt-2 text-body-md text-body">
              {T.faqPrecoLead({
                aeroporto: aeroportoLabel(destino),
                menor: diaria1 ? formatBRL(diaria1.from) : null,
              })}{" "}
              {T.faqPrecoFonte}
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-body-sm">
                <thead>
                  <tr className="border-b border-hairline text-muted">
                    <th className="py-2 pr-4 font-medium">{T.faqPeriodo}</th>
                    <th className="py-2 pr-4 font-medium">{T.faqTotalAPartirDe}</th>
                    <th className="py-2 font-medium">{T.faqPorDia}</th>
                  </tr>
                </thead>
                <tbody>
                  {precoDestino.byDuration.map((d) => (
                    <tr key={d.days} className="border-b border-hairline-soft">
                      <td className="py-2 pr-4 text-ink">{T.duracao(d.days)}</td>
                      <td className="py-2 pr-4 text-ink">{formatBRL(d.from)}</td>
                      <td className="py-2 text-body">{formatBRL(d.fromPerDay)}
                        {T.faqPorDiaUnidade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-body-sm text-muted">
              {T.faqNoComparativo({
                unidades: precoDestino.unitCount,
                parceiros: precoDestino.partnerCount,
              })}{" "}
              <Link
                to={caminhoPrecos(precoDestino.public_slug ?? precoDestino.slug)}
                className="font-medium text-mp-indigo underline-offset-2 hover:underline"
              >
                {T.tabelaCompleta}
              </Link>
            </p>
          </section>
        )}

        {/* Versão de rede pras perguntas gerais de preço: números da plataforma. */}
        {paginaDePreco && !destino && precoRede && (
          <section className="mt-8">
            <h2 className="text-display-sm text-ink">
              {T.faqEstacionamentoCom}
            </h2>
            <p className="mt-2 text-body-md text-body">
              {T.faqRedeTexto({
                unidades: precoRede.unitCount,
                destinos: precoRede.destinationCount,
                menor: precoRede.minDailyFrom != null ? formatBRL(precoRede.minDailyFrom) : null,
              })}{" "}
              <Link
                to="/precos"
                className="font-medium text-mp-indigo underline-offset-2 hover:underline"
              >
                {T.faqIndicePrecos}
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
              {T.faqComoEscolher(aeroportoLabel(destino))}
            </h2>
            <p className="mt-2 text-body-md text-body">
              {T.faqComoEscolherTexto(aeroportoLabel(destino))}
            </p>
          </section>
        ) : (
          <section className="mt-8">
            <h2 className="text-display-sm text-ink">{T.faqComoReservar}</h2>
            <p className="mt-2 text-body-md text-body">
              {T.faqComoReservarTexto}
            </p>
          </section>
        ))}

        {/* Checklist do que olhar antes de decidir, também só onde a decisão de
            preço é o assunto da página. */}
        {paginaDePreco && (
          <section className="mt-8">
            <h2 className="text-display-sm text-ink">{T.faqOQueConferir}</h2>
            <ul className="mt-3 space-y-2">
              {T.faqChecklist({ semParceiro }).map((item) => (
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
                  <Link to={linkDestino(destino)}>
                    {T.faqVerEstacionamentos(destinoCurto ?? destino.name)}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/precos">{T.faqCompararOutros}</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild>
                  <Link to={linkDestino(destino)}>
                    {T.faqReservarEm(destinoCurto ?? destino.name)}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to={caminhoPrecos(destino.public_slug ?? destino.slug)}>
                    {T.faqCompararEm(destinoCurto ?? destino.name)}
                  </Link>
                </Button>
              </>
            )
          ) : (
            <>
              <Button asChild>
                <Link to="/search">{T.faqBuscar}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/precos">{T.faqCompararPrecos}</Link>
              </Button>
            </>
          )}
        </div>

        {/* Em idioma traduzido a lista de relacionadas some: `pickRelatedFaqs` trabalha
            sobre o índice em português, e mostrar título em português numa página em
            inglês é o mesmo defeito que o portão existe para impedir. Volta quando a
            relação for calculada sobre o índice traduzido. */}
        {locale === LOCALE_PADRAO && related.length > 0 && (
          <section className="mt-10 border-t border-hairline pt-8">
            <h2 className="text-display-sm text-ink">{T.faqRelacionadas}</h2>
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
            {T.faqTodasPerguntas}
          </Link>
        </div>
      </article>
    </>
  );
}
