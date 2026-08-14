import { Link, useLoaderData } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatBRL, formatDate } from "@/lib/format";
import { breadcrumbSchema, itemListSchema } from "@/lib/jsonld";
import { cn } from "@/lib/utils";
import { OgImage } from "@/lib/ogImage";
import {
  destinationSummary,
  formatDistance,
  listingPath,
  overallStats,
  topRows,
  type PriceDestination,
  type PriceIndexData,
} from "@/features/price-index/priceIndex.logic";

const SITE_URL = "https://hub.movepark.co";

export type PrecosIndexData = {
  data: PriceIndexData;
  /** Aeroportos publicados que ainda não têm parceiro com preço no motor. */
  semPreco: { slug: string; name: string; short_name: string | null }[];
  /** Momento do build (ou da navegação) em que o motor foi consultado. */
  generatedAt: string;
};

const DESCRIPTION =
  "Preços de estacionamento por aeroporto: diária avulsa, 7 e 15 dias em uma tabela por " +
  "destino, com preço de balcão e reserva online. O valor da tabela é o mesmo do checkout.";

/** Tabela de um destino no índice: top 5 vagas, ordenadas pela diária avulsa. */
function TabelaDestino({
  dest,
  generatedAt,
}: {
  dest: PriceDestination;
  generatedAt: string;
}) {
  const nome = dest.short_name ?? dest.name;
  const { rows, hiddenCount } = topRows(dest, 5);
  const summary = destinationSummary(dest, [1, 7, 15]);
  if (rows.length === 0) return null;

  return (
    <section id={dest.slug} className="mt-12 scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="text-display-sm text-ink">
            <Link to={`/precos/${dest.slug}`} className="hover:text-mp-primary">
              {nome}
            </Link>
          </h2>
          <p className="mt-1 text-body-sm text-muted">
            {rows.length + hiddenCount === 1
              ? "1 vaga de parceiro"
              : `${rows.length + hiddenCount} vagas de parceiros`}
            {" · "}ordenado pela diária mais baixa
          </p>
        </div>
        <Link
          to={`/precos/${dest.slug}`}
          className="text-body-sm font-medium text-mp-indigo underline-offset-2 hover:underline"
        >
          Tabela completa
        </Link>
      </div>

      <table className="mt-4 block w-full border-collapse tablet:table">
        <caption className="sr-only">Preços de estacionamento em {nome}</caption>
        <thead className="hidden tablet:table-header-group">
          <tr>
            <th
              scope="col"
              className="border-b border-hairline py-2 pr-3 text-left text-caption-sm font-medium text-muted"
            >
              Estacionamento
            </th>
            <th
              scope="col"
              className="border-b border-hairline px-3 py-2 text-left text-caption-sm font-medium text-muted"
            >
              Diária avulsa
            </th>
            <th
              scope="col"
              className="border-b border-hairline px-3 py-2 text-left text-caption-sm font-medium text-muted"
            >
              7 dias (R$/dia)
            </th>
            <th
              scope="col"
              className="border-b border-hairline px-3 py-2 text-left text-caption-sm font-medium text-muted"
            >
              15 dias (R$/dia)
            </th>
            <th scope="col" className="border-b border-hairline py-2 pl-3">
              <span className="sr-only">Reservar</span>
            </th>
          </tr>
        </thead>
        <tbody className="block space-y-3 tablet:table-row-group">
          {rows.map((row) => (
            <tr
              key={row.key}
              className="grid grid-cols-3 gap-x-3 gap-y-3 rounded-lg border border-hairline p-4 tablet:table-row tablet:border-0 tablet:p-0"
            >
              <td className="order-1 col-span-2 tablet:table-cell tablet:border-b tablet:border-hairline tablet:py-3 tablet:pr-3 tablet:align-top">
                <div className="flex flex-col gap-0.5">
                  <span className="text-title-sm text-ink">{row.label}</span>
                  <span className="text-caption-sm text-muted">
                    {row.unit.parking_type_name}
                    {formatDistance(row.unit.distance_m) && (
                      <> · {formatDistance(row.unit.distance_m)}</>
                    )}
                  </span>
                  <span className="text-caption-sm font-medium text-mp-indigo">
                    Parceiro Movepark
                  </span>
                </div>
              </td>
              {row.cells.map((cell) => (
                <td
                  key={cell.days}
                  className={cn(
                    "tablet:table-cell tablet:border-b tablet:border-hairline tablet:px-3 tablet:py-3 tablet:align-top",
                    cell.days === 1 ? "order-3" : cell.days === 7 ? "order-4" : "order-5",
                    cell.isCheapest && "tablet:bg-mp-pale",
                  )}
                >
                  <span className="block text-caption-sm text-muted tablet:hidden">
                    {cell.days === 1 ? "Diária" : `${cell.days} dias`}
                  </span>
                  {cell.total != null ? (
                    cell.days === 1 ? (
                      <>
                        {cell.oldTotal != null && (
                          <span className="block text-caption-sm text-muted line-through tabular-nums">
                            {formatBRL(cell.oldTotal)}
                          </span>
                        )}
                        <span className="block text-title-md tabular-nums text-ink">
                          {formatBRL(cell.total)}
                        </span>
                        {cell.economyPct != null && (
                          <span className="block text-caption-sm font-medium text-success">
                            {cell.economyPct}% menor online
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="block text-title-md tabular-nums text-ink">
                          {formatBRL(cell.perDay)}
                        </span>
                        <span className="block text-caption-sm tabular-nums text-muted">
                          total {formatBRL(cell.total)}
                        </span>
                        {cell.economyPct != null && (
                          <span className="block text-caption-sm font-medium text-success">
                            {cell.economyPct}% menor online
                          </span>
                        )}
                      </>
                    )
                  ) : cell.minStayDays != null ? (
                    <span className="block text-caption-sm text-muted">
                      mín. {cell.minStayDays} diárias
                    </span>
                  ) : (
                    <span className="block text-caption-sm text-muted">ver na página</span>
                  )}
                </td>
              ))}
              <td className="order-2 justify-self-end tablet:table-cell tablet:border-b tablet:border-hairline tablet:py-3 tablet:pl-3 tablet:text-right tablet:align-middle">
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
        Fonte: motor de reservas Movepark, o mesmo preço do checkout · conferido em{" "}
        <time dateTime={generatedAt}>{formatDate(generatedAt)}</time>
        {summary.lastUpdated && (
          <>
            {" "}
            · tabela de parceiro mais recente de{" "}
            <time dateTime={summary.lastUpdated}>{formatDate(summary.lastUpdated)}</time>
          </>
        )}
        {hiddenCount > 0 && (
          <>
            {" · "}
            <Link
              to={`/precos/${dest.slug}`}
              className="font-medium text-mp-indigo underline-offset-2 hover:underline"
            >
              mais {hiddenCount} {hiddenCount === 1 ? "vaga" : "vagas"} na tabela completa
            </Link>
          </>
        )}
      </p>
    </section>
  );
}

/**
 * Índice de preços (/precos): uma tabela editorial por destino, tirada do motor
 * de reservas a cada publicação. Pré-renderizado no build; cada destino tem
 * página própria em /precos/<slug> (com a matriz completa, incluindo 30 diárias)
 * e gêmeo Markdown.
 */
export default function PrecosPage() {
  const loaded = useLoaderData() as PrecosIndexData | null;

  if (!loaded || loaded.data.destinations.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-16">
        <EmptyState
          title="Índice de preços indisponível"
          description="Sem dados de preço agora. Busque por data para ver os valores das vagas."
          action={
            <Link to="/search" className="text-mp-primary underline">
              Buscar estacionamento
            </Link>
          }
        />
      </div>
    );
  }

  const { data, semPreco, generatedAt } = loaded;
  const stats = overallStats(data);
  const canonical = `${SITE_URL}/precos`;
  const titulo = "Índice de preços de estacionamento";

  const breadcrumb = breadcrumbSchema([
    { name: "Início", url: SITE_URL },
    { name: "Índice de preços", url: canonical },
  ]);
  const lista = itemListSchema(
    data.destinations.map((d) => ({
      name: `Preços de estacionamento em ${d.short_name ?? d.name}`,
      url: `${SITE_URL}/precos/${d.slug}`,
    })),
  );

  return (
    <>
      <Helmet>
        <title>{`${titulo}: diária, 7 e 15 dias por aeroporto | Movepark`}</title>
        <meta name="description" content={DESCRIPTION} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={`${titulo} | Movepark`} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:url" content={canonical} />
        <script type="application/ld+json">{JSON.stringify(breadcrumb)}</script>
        <script type="application/ld+json">{JSON.stringify(lista)}</script>
      </Helmet>
      <OgImage area="precos" />

      <div className="mx-auto w-full max-w-[1080px] px-4 py-12">
        <PageHeader
          variant="content"
          size="lg"
          title={titulo}
          description="Quanto custa estacionar perto de cada aeroporto, no preço real de reserva: uma tabela por destino, com diária avulsa, 7 e 15 dias e o balcão ao lado."
        >
          <p className="text-caption-sm text-muted">
            Conferido no motor de reservas em{" "}
            <time dateTime={generatedAt}>{formatDate(generatedAt)}</time>
          </p>
        </PageHeader>

        {/* O retrato do índice em quatro números, direto do dado. */}
        <dl className="mt-8 grid grid-cols-2 gap-4 tablet:grid-cols-4">
          <div className="rounded-lg border border-hairline p-4">
            <dt className="text-caption-sm text-muted">Destinos com preço</dt>
            <dd className="mt-1 text-display-sm text-ink">{stats.destinationCount}</dd>
          </div>
          <div className="rounded-lg border border-hairline p-4">
            <dt className="text-caption-sm text-muted">Estacionamentos comparados</dt>
            <dd className="mt-1 text-display-sm text-ink">{stats.unitCount}</dd>
          </div>
          <div className="rounded-lg border border-hairline p-4">
            <dt className="text-caption-sm text-muted">Menor diária hoje</dt>
            <dd className="mt-1 text-display-sm tabular-nums text-ink">
              {formatBRL(stats.minDailyFrom)}
            </dd>
          </div>
          <div className="rounded-lg border border-hairline p-4">
            <dt className="text-caption-sm text-muted">Economia sobre o balcão</dt>
            <dd className="mt-1 text-display-sm text-ink">
              {stats.maxEconomyPct != null ? `até ${stats.maxEconomyPct}%` : "varia"}
            </dd>
          </div>
        </dl>

        {/* Atalhos: um pulo por destino, na ordem das tabelas. */}
        <nav aria-label="Destinos desta página" className="mt-8">
          <ul className="flex flex-wrap gap-2">
            {data.destinations.map((d) => (
              <li key={d.slug}>
                <a
                  href={`#${d.slug}`}
                  className="inline-block rounded-full border border-hairline px-3 py-1.5 text-body-sm text-ink transition hover:border-mp-primary hover:text-mp-primary"
                >
                  {d.short_name ?? d.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {data.destinations.map((dest) => (
          <TabelaDestino key={dest.slug} dest={dest} generatedAt={generatedAt} />
        ))}

        {semPreco.length > 0 && (
          <section className="mt-12 border-t border-hairline pt-8">
            <h2 className="text-display-sm text-ink">Aeroportos ainda sem reserva online</h2>
            <p className="mt-2 text-body-md text-body">
              Nestes destinos ainda não há parceiro com preço no motor. A página de cada um mostra
              os estacionamentos da região:
            </p>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              {semPreco.map((a) => (
                <li key={a.slug}>
                  <Link
                    to={`/destinos/${a.slug}`}
                    className="text-body-md text-ink underline-offset-2 hover:text-mp-primary hover:underline"
                  >
                    {a.short_name ?? a.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-12 max-w-[720px]">
          <h2 className="text-display-sm text-ink">De onde vêm estes preços</h2>
          <p className="mt-3 text-body-md text-body">
            Do motor de preços da Movepark, o mesmo que calcula sua reserva. O valor que aparece
            aqui é o cobrado no checkout e muda junto com a tabela de cada parceiro, com a data da
            última atualização à vista.
          </p>
          <p className="mt-3 text-body-md text-body">
            Nada fica sob consulta: se o estacionamento está na tabela, dá para reservar por
            aquele valor. O preço riscado é o balcão, a tarifa de quem chega sem reserva. Quando
            reservar online sai mais barato, a economia aparece na própria célula.
          </p>
          <p className="mt-3 text-body-md text-body">
            Alguns estacionamentos só aceitam entrada a partir de 2 ou 3 diárias. Nesses casos a
            tabela mostra a regra no lugar do preço, em vez de esconder a linha. A tabela completa
            de cada destino traz também o total de 30 diárias.
          </p>
        </section>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Button asChild>
            <Link to="/calculadora-estacionamento-aeroporto">Calcular para a minha viagem</Link>
          </Button>
          <Link
            to="/search"
            className="text-body-sm font-medium text-mp-indigo underline-offset-2 hover:underline"
          >
            Buscar por data
          </Link>
        </div>
      </div>
    </>
  );
}
