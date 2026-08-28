import { Link, useLoaderData } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatBRL, formatDate } from "@/lib/format";
import { breadcrumbSchema } from "@/lib/jsonld";
import { cn } from "@/lib/utils";
import { OgImage } from "@/lib/ogImage";
import {
  buildMatrix,
  destinationSummary,
  durationLabel,
  formatDistance,
  listingPath,
  metaDescription,
  motoUnits,
  priceFor,
  unitLabel,
  type MatrixRow,
  type PriceDestination,
} from "@/features/price-index/priceIndex.logic";
import { SITE_URL } from "@/lib/site";
import { caminhoDestino, caminhoPrecos } from "@/lib/urls";

export type PrecosDestinoData = {
  days: number[];
  destination: PriceDestination;
  /** Demais destinos do índice, para o cross-link no fim da página. */
  others: { slug: string; name: string; short_name: string | null }[];
  /** Momento do build (ou da navegação) em que o motor foi consultado. */
  generatedAt: string;
};

/** "280 m do terminal" em aeroporto e rodoviária; nos demais, só a distância. */
function distanciaLabel(dest: PriceDestination, m: number | null): string | null {
  const d = formatDistance(m);
  if (!d) return null;
  return dest.type === "airport" || dest.type === "bus_terminal" ? `${d} do terminal` : d;
}

/** Host na frente do caminho relativo do legado, que o buscador não resolve em JSON-LD. */
function absolutaSite(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `${SITE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * JSON-LD: um Product por vaga, com a faixa de preço real das durações.
 *
 * Linha sem preço em nenhuma duração fica de fora da lista. A matriz aceita a linha muda de
 * propósito (quem não tem preço na duração de referência vai para o fim da tabela), mas aqui
 * ela daria `Math.min()` de lista vazia, que é `Infinity`, e um `Product` sem `offers` válida,
 * que o Google reprova como item inválido. A linha continua visível na tabela.
 */
function produtosSchema(dest: PriceDestination, rows: MatrixRow[]) {
  const nome = dest.short_name ?? dest.name;
  const comPreco = rows
    .map((row) => ({
      row,
      totais: row.cells.map((c) => c.total).filter((t): t is number => t != null),
    }))
    .filter((r) => r.totais.length > 0);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: comPreco.map(({ row, totais }, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Product",
        name: `${row.label} · ${row.unit.parking_type_name}`,
        description: `Estacionamento perto de ${nome}, com reserva online pela Movepark.`,
        // `image` é recomendado pelo Google no Product, e sem ele o Search Console acusa aviso
        // na lista inteira. É a mesma capa que a busca e a página da unidade usam; absoluta,
        // porque metade das unidades guarda caminho relativo do legado.
        image: row.unit.photo ? [absolutaSite(row.unit.photo)] : undefined,
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "BRL",
          lowPrice: Math.min(...totais).toFixed(2),
          highPrice: Math.max(...totais).toFixed(2),
          offerCount: totais.length,
          url: `${SITE_URL}${listingPath(row.unit)}`,
        },
      },
    })),
  };
}

/**
 * Página de preços de um destino (/precos/<slug>): a matriz real de 1, 7, 15 e
 * 30 diárias das unidades parceiras, com o balcão riscado ao lado. Answer-first
 * (o menor preço por duração abre a página) e pré-renderizada no build, porque
 * crawler de IA não executa JS. A mesma tabela sai em Markdown no build
 * (generate-geo-artifacts) e responde em /precos/<slug> via Accept: text/markdown.
 */
export default function PrecosDestinoPage() {
  const data = useLoaderData() as PrecosDestinoData | null;

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-16">
        <EmptyState
          title="Sem tabela de preços por aqui"
          description="Esse destino não existe ou ainda não tem estacionamento parceiro com preço."
          action={
            <Link to="/precos" className="text-mp-primary underline">
              Ver o índice de preços
            </Link>
          }
        />
      </div>
    );
  }

  const { days, destination, others, generatedAt } = data;
  const destinoSlug = destination.public_slug ?? destination.slug;
  const nome = destination.short_name ?? destination.name;
  const matrix = buildMatrix(destination, days);
  const summary = destinationSummary(destination, days);
  const motos = motoUnits(destination.units);
  const temMinStay = matrix.rows.some((r) => r.cells.some((c) => c.minStayDays != null));

  const canonical = `${SITE_URL}/precos/${destination.slug}`;
  const titulo = `Preços de estacionamento em ${nome}: diária, 7, 15 e 30 dias`;
  const description = metaDescription(destination, summary);

  const breadcrumb = breadcrumbSchema([
    { name: "Início", url: SITE_URL },
    { name: "Índice de preços", url: `${SITE_URL}/precos` },
    { name: nome, url: canonical },
  ]);

  return (
    <>
      <Helmet>
        <title>{`${titulo} | Movepark`}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={`${titulo} | Movepark`} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <script type="application/ld+json">{JSON.stringify(breadcrumb)}</script>
        <script type="application/ld+json">
          {JSON.stringify(produtosSchema(destination, matrix.rows))}
        </script>
      </Helmet>
      <OgImage area="precos" />

      <article className="mx-auto w-full max-w-[1080px] px-4 py-12">
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
              <Link to="/precos" className="hover:text-ink">
                Índice de preços
              </Link>
            </li>
            <li aria-hidden className="text-muted-steel">
              ›
            </li>
            <li aria-current="page" className="text-ink">
              {nome}
            </li>
          </ol>
        </nav>

        <PageHeader
          variant="content"
          eyebrow="Índice de preços"
          title={`Preços de estacionamento em ${nome}`}
          description="A tabela de reserva dos estacionamentos parceiros, com o preço de balcão ao lado. O valor daqui é o mesmo do checkout."
        >
          <p className="text-caption-sm text-muted">
            Conferido no motor de reservas em{" "}
            <time dateTime={generatedAt}>{formatDate(generatedAt)}</time>
            {summary.lastUpdated && (
              <>
                {" "}
                · tabela de parceiro mais recente de{" "}
                <time dateTime={summary.lastUpdated}>{formatDate(summary.lastUpdated)}</time>
              </>
            )}
          </p>
        </PageHeader>

        {/* Resposta rápida: o menor preço por duração, extraível por buscador e IA. */}
        <section className="mt-6 rounded-lg bg-mp-pale p-5 tablet:p-6">
          <h2 className="text-title-md text-ink">Resposta rápida</h2>
          <ul className="mt-3 space-y-2">
            {summary.byDuration.map((s) => (
              <li key={s.days} className="text-body-md text-body">
                <strong className="font-semibold text-ink">{durationLabel(s.days)}:</strong>{" "}
                a partir de {formatBRL(s.from)} no {s.unitLabel} ({s.parkingTypeName}
                {s.days > 1 && <>, {formatBRL(s.fromPerDay)} por diária</>})
              </li>
            ))}
          </ul>
          {summary.maxEconomyPct != null && (
            <p className="mt-3 text-body-md text-body">
              Reservando online, a economia sobre o balcão chega a{" "}
              <strong className="font-semibold text-ink">{summary.maxEconomyPct}%</strong> neste
              destino.
            </p>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-display-sm text-ink">Tabela de preços</h2>
          <p className="mt-2 text-body-sm text-muted">
            {summary.unitCount === 1
              ? "1 estacionamento parceiro comparado"
              : `${summary.unitCount} estacionamentos parceiros comparados`}
            , total por período.
          </p>

          <table className="mt-4 block w-full border-collapse tablet:table">
            <caption className="sr-only">
              Preços de estacionamento em {nome} por duração
            </caption>
            <thead className="hidden tablet:table-header-group">
              <tr>
                <th
                  scope="col"
                  className="border-b border-hairline py-2 pr-3 text-left text-caption-sm font-medium text-muted"
                >
                  Estacionamento
                </th>
                {matrix.days.map((d) => (
                  <th
                    key={d}
                    scope="col"
                    className="border-b border-hairline px-3 py-2 text-left text-caption-sm font-medium text-muted"
                  >
                    {durationLabel(d)}
                  </th>
                ))}
                <th scope="col" className="border-b border-hairline py-2 pl-3">
                  <span className="sr-only">Reservar</span>
                </th>
              </tr>
            </thead>
            <tbody className="block space-y-3 tablet:table-row-group">
              {matrix.rows.map((row) => (
                <tr
                  key={row.key}
                  className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-hairline p-4 tablet:table-row tablet:border-0 tablet:p-0"
                >
                  <td className="col-span-2 tablet:table-cell tablet:border-b tablet:border-hairline tablet:py-3 tablet:pr-3 tablet:align-top">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-title-sm text-ink">{row.label}</span>
                      <span className="text-caption-sm text-muted">
                        {row.unit.parking_type_name}
                        {distanciaLabel(destination, row.unit.distance_m) && (
                          <> · {distanciaLabel(destination, row.unit.distance_m)}</>
                        )}
                        {row.unit.has_shuttle && <> · traslado</>}
                      </span>
                      {row.unit.review_count > 0 && row.unit.review_avg != null && (
                        <span className="text-caption-sm text-muted">
                          ★ {Number(row.unit.review_avg).toFixed(1).replace(".", ",")} (
                          {row.unit.review_count})
                        </span>
                      )}
                    </div>
                  </td>
                  {row.cells.map((cell) => (
                    <td
                      key={cell.days}
                      className={cn(
                        "tablet:table-cell tablet:border-b tablet:border-hairline tablet:px-3 tablet:py-3 tablet:align-top",
                        cell.isCheapest && "tablet:bg-mp-pale",
                      )}
                    >
                      <span className="block text-caption-sm text-muted tablet:hidden">
                        {durationLabel(cell.days)}
                      </span>
                      {cell.total != null ? (
                        <>
                          {cell.oldTotal != null && (
                            <span className="block text-caption-sm text-muted line-through tabular-nums">
                              {formatBRL(cell.oldTotal)}
                            </span>
                          )}
                          <span className="block text-title-md tabular-nums text-ink">
                            {formatBRL(cell.total)}
                          </span>
                          {cell.days > 1 && cell.perDay != null && (
                            <span className="block text-caption-sm tabular-nums text-muted">
                              {formatBRL(cell.perDay)} por diária
                            </span>
                          )}
                          {cell.economyPct != null && (
                            <span className="block text-caption-sm font-medium text-success">
                              {cell.economyPct}% menor online
                            </span>
                          )}
                          {cell.isCheapest && (
                            <span className="block text-caption-sm font-medium text-mp-indigo">
                              Melhor preço
                            </span>
                          )}
                        </>
                      ) : cell.minStayDays != null ? (
                        <span className="block text-caption-sm text-muted">
                          entrada a partir de {cell.minStayDays} diárias
                        </span>
                      ) : (
                        <span className="block text-caption-sm text-muted">ver na página</span>
                      )}
                    </td>
                  ))}
                  <td className="col-span-2 tablet:table-cell tablet:border-b tablet:border-hairline tablet:py-3 tablet:pl-3 tablet:text-right tablet:align-middle">
                    <Link
                      to={listingPath(row.unit)}
                      className="text-body-sm font-medium text-mp-primary underline-offset-2 hover:underline"
                    >
                      Reservar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-3 text-caption-sm text-muted">
            Preço riscado: balcão do estacionamento, sem reserva.
            {temMinStay &&
              " Onde aparece a entrada mínima, o parceiro só aceita estadias a partir daquele número de diárias."}
          </p>
        </section>

        {motos.length > 0 && (
          <section className="mt-8">
            <h3 className="text-title-md text-ink">Vaga de moto</h3>
            <ul className="mt-2 space-y-1">
              {motos.map((moto) => (
                <li key={`${moto.company_slug}/${moto.location_slug}`} className="text-body-sm text-body">
                  {unitLabel(moto, motos)}:{" "}
                  {days
                    .map((d) => {
                      const total = priceFor(moto, d)?.total;
                      return total != null ? `${durationLabel(d)} ${formatBRL(total)}` : null;
                    })
                    .filter(Boolean)
                    .join(", ")}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-10">
          <h2 className="text-display-sm text-ink">De onde vêm estes preços</h2>
          <p className="mt-3 text-body-md text-body">
            Do motor de preços da Movepark, o mesmo que calcula sua reserva. O valor desta página
            é o cobrado no checkout e muda junto com a tabela do parceiro.
          </p>
          <p className="mt-3 text-body-md text-body">
            O preço riscado é o balcão: a tarifa de quem chega sem reservar. Quando reservar
            online sai mais barato, a diferença aparece na própria célula.
          </p>
          <Link
            to="/precos"
            className="mt-3 inline-block text-body-sm font-medium text-mp-indigo underline-offset-2 hover:underline"
          >
            Ver o índice completo de preços
          </Link>
        </section>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button asChild>
            <Link to={caminhoDestino(destinoSlug)}>Ver estacionamentos em {nome}</Link>
          </Button>
          <Link
            to="/search"
            className="text-body-sm font-medium text-mp-indigo underline-offset-2 hover:underline"
          >
            Buscar por data
          </Link>
        </div>

        {others.length > 0 && (
          <section className="mt-10 border-t border-hairline pt-8">
            <h2 className="text-display-sm text-ink">Preços em outros destinos</h2>
            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              {others.map((o) => (
                <li key={o.slug}>
                  <Link
                    to={caminhoPrecos(o.slug)}
                    className="text-body-md text-ink underline-offset-2 hover:text-mp-primary hover:underline"
                  >
                    {o.short_name ?? o.name}
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
