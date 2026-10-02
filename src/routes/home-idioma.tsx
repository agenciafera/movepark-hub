import { Link, useLoaderData, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { MapPin } from "@phosphor-icons/react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import {
  LANG_HTML,
  LOCALES,
  OG_LOCALE,
  caminhoDoIndice,
  caminhoLocalizado,
  clusterHreflang,
  localeDoCaminho,
  urlDaHome,
  type Locale,
  type LocaleTraduzido,
} from "@/lib/i18n";
import { textos } from "@/lib/i18nTextos";
import { breadcrumbSchema, itemListSchema, organizationSchema, webPageSchema } from "@/lib/jsonld";
import { OgImage } from "@/lib/ogImage";
import { SITE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

/** Um aeroporto na grade, já com o rótulo e o slug daquele idioma. */
export type DestinoNaHome = {
  id: string;
  /** Rótulo no idioma da página: o `seo_label` da tradução, com queda para o nome. */
  rotulo: string;
  /** Slug daquele idioma, que é o que a URL usa. */
  slug: string;
  cidade: string;
  estado: string | null;
  popular: boolean;
};

export type HomeIdiomaData = {
  locale: LocaleTraduzido;
  destinos: DestinoNaHome[];
  /** Quantos clientes a prova social declara. Zero esconde o bloco. */
  clientes: number;
  /** Se aquele idioma tem post traduzido. Sem post, o bloco do blog não aparece. */
  temBlog: boolean;
};

const CONTAINER = "mx-auto w-full max-w-[1280px] px-4 desktop:px-8";

/**
 * A home de um idioma traduzido (`/en`, `/es`).
 *
 * NÃO é a tradução da home portuguesa, e a diferença é deliberada. A home em
 * português abre com a barra de busca e com os cards de unidade, e as duas coisas
 * levam para rotas que só existem em português: `/search` e
 * `/estacionamentos/<destino>/<lote>`. Traduzir a casca em volta delas entregaria uma
 * página em inglês cujo primeiro clique cai no português, que é o mesmo defeito do
 * `hreflang` apontando para 404, só que provocado pelo próprio visitante.
 *
 * Então esta página funila para o que EXISTE no idioma: as páginas de aeroporto, as
 * perguntas e os guias, todas traduzidas. Quando a unidade e a busca ganharem rota
 * localizada, o funil daqui cresce junto, sem nada para desfazer.
 */
export default function HomeIdiomaPage() {
  const loaded = useLoaderData() as HomeIdiomaData | null;
  const { pathname } = useLocation();

  const locale = localeDoCaminho(pathname).locale as LocaleTraduzido;
  const T = textos(locale);
  const canonical = urlDaHome(SITE_URL, locale);

  const destinos = loaded?.locale === locale ? loaded.destinos : [];
  const populares = destinos.filter((d) => d.popular);
  const outros = destinos.filter((d) => !d.popular);
  const clientes = loaded?.clientes ?? 0;
  const temBlog = loaded?.temBlog ?? false;

  const hrefDestino = (slug: string) =>
    caminhoLocalizado({ familia: "destino", slug, locale });

  // O cluster da home é fixo: as três existem por deploy. `x-default` fica no português.
  const hreflangs = clusterHreflang(
    LOCALES.map((l: Locale) => ({ locale: l, caminho: urlDaHome(SITE_URL, l) })),
  );

  return (
    <>
      <Helmet htmlAttributes={{ lang: LANG_HTML[locale] }}>
        <title>{T.homeMetaTitle}</title>
        <meta name="description" content={T.homeMetaDescription} />
        <link rel="canonical" href={canonical} />
        {hreflangs.map((h) => (
          <link key={h.hreflang} rel="alternate" hrefLang={h.hreflang} href={h.href} />
        ))}
        <meta property="og:type" content="website" />
        <meta property="og:locale" content={OG_LOCALE[locale]} />
        <meta property="og:title" content={T.homeMetaTitle} />
        <meta property="og:description" content={T.homeMetaDescription} />
        <meta property="og:url" content={canonical} />
        {/*
          A entidade Movepark, pelo `@id`, é a MESMA nos três idiomas: repetir o bloco
          aqui acumula sinal na mesma entidade em vez de criar uma organização por
          idioma. O `WebSite` NÃO é reemitido: ele tem `@id` único e `inLanguage`
          pt-BR, e um segundo nó com o mesmo `@id` e outro idioma seria contradição no
          grafo. Quem declara o idioma desta URL é a `WebPage`.
        */}
        <script type="application/ld+json">{JSON.stringify(organizationSchema())}</script>
        <script type="application/ld+json">
          {JSON.stringify(webPageSchema({ url: canonical, name: T.homeMetaTitle, locale }))}
        </script>
        <script type="application/ld+json">
          {JSON.stringify(
            breadcrumbSchema([{ name: "Movepark", url: canonical }]),
          )}
        </script>
        {destinos.length > 0 && (
          <script type="application/ld+json">
            {JSON.stringify(
              itemListSchema(
                destinos.map((d) => ({
                  name: d.rotulo,
                  url: `${SITE_URL}${hrefDestino(d.slug)}`,
                })),
              ),
            )}
          </script>
        )}
      </Helmet>
      <OgImage area="marca" />

      <section className="border-b border-hairline bg-surface-soft">
        <div className={cn(CONTAINER, "py-16 desktop:py-20")}>
          <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-muted-steel">
            {T.homeEyebrow}
          </span>
          <h1 className="mt-3 text-balance text-display-3xl text-ink">{T.homeH1}</h1>
          <p className="mt-5 max-w-[60ch] text-body-md text-body">{T.homeLead}</p>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            {T.homeSelos.map((selo) => (
              <li key={selo} className="text-body-sm text-muted">
                {selo}
              </li>
            ))}
          </ul>

          {clientes > 0 && (
            <p className="mt-6 text-body-sm text-muted">
              {T.homeProvaSocial(new Intl.NumberFormat(T.intlLocale).format(clientes))}
            </p>
          )}

          {/*
            Diz em voz alta onde o idioma termina. O leitor descobre antes de clicar, em
            vez de descobrir no meio do checkout, e é a mesma regra do aviso do índice
            do blog: declarar o limite é mais barato que fingir que ele não existe.
          */}
          {T.homeAvisoIdioma && (
            <p className="mt-8 max-w-[60ch] text-body-sm text-muted">{T.homeAvisoIdioma}</p>
          )}
        </div>
      </section>

      <section className={cn(CONTAINER, "py-14")}>
        <h2 className="text-display-xl text-ink">{T.homeDestinosTitulo}</h2>
        <p className="mt-3 max-w-[60ch] text-body-md text-muted">{T.homeDestinosLead}</p>

        {destinos.length === 0 ? (
          <div className="mt-10">
            <EmptyState icon={<MapPin className="h-10 w-10" />} title={T.homeDestinosTitulo} />
          </div>
        ) : (
          <>
            {populares.length > 0 && (
              <div className="mt-10">
                <h3 className="mb-4 text-display-md text-ink">{T.homeMaisBuscados}</h3>
                <Grade destinos={populares} href={hrefDestino} />
              </div>
            )}
            {outros.length > 0 && (
              <div className="mt-10">
                <h3 className="mb-4 text-display-md text-ink">{T.homeOutrosDestinos}</h3>
                <Grade destinos={outros} href={hrefDestino} />
              </div>
            )}
          </>
        )}
      </section>

      <section className="border-t border-hairline bg-surface-soft">
        <div className={cn(CONTAINER, "grid gap-10 py-14 desktop:grid-cols-2")}>
          <div>
            <h2 className="text-display-md text-ink">{T.homeFaqTitulo}</h2>
            <p className="mt-3 max-w-[48ch] text-body-md text-muted">{T.homeFaqLead}</p>
            <Button asChild className="mt-5">
              <Link to={caminhoDoIndice("faq", locale)}>{T.homeFaqBotao}</Link>
            </Button>
          </div>
          {temBlog && (
            <div>
              <h2 className="text-display-md text-ink">{T.homeBlogTitulo}</h2>
              <p className="mt-3 max-w-[48ch] text-body-md text-muted">{T.homeBlogLead}</p>
              <Button asChild variant="outline" className="mt-5">
                <Link to={caminhoDoIndice("blog", locale)}>{T.homeBlogBotao}</Link>
              </Button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function Grade({
  destinos,
  href,
}: {
  destinos: DestinoNaHome[];
  href: (slug: string) => string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
      {destinos.map((d) => (
        <Link
          key={d.id}
          to={href(d.slug)}
          className="group flex flex-col gap-1 rounded-md border border-hairline p-4 transition-colors hover:border-mp-primary hover:bg-surface-soft"
        >
          <span className="flex items-center gap-2 text-title-sm text-ink">
            <MapPin className="h-4 w-4 text-mp-primary" />
            {d.rotulo}
          </span>
          <span className="text-body-sm text-muted">
            {d.cidade}
            {d.estado ? ` · ${d.estado}` : ""}
          </span>
        </Link>
      ))}
    </div>
  );
}
