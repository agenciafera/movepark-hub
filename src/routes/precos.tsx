import * as React from "react";
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
  airportStates,
  buildAirportSections,
  destinationSummary,
  formatDistance,
  listingPath,
  matchesAirportFilter,
  overallStats,
  type AirportFilter,
  type AirportMeta,
  type AirportSection,
  type IndexProspect,
  type PriceIndexData,
} from "@/features/price-index/priceIndex.logic";
import { SITE_URL } from "@/lib/site";

export type PrecosIndexData = {
  data: PriceIndexData;
  /** Todos os aeroportos publicados, com ou sem parceiro precificado. */
  aeroportos: AirportMeta[];
  /** Lotes mapeados sem contrato por slug de destino (ADR-010). */
  prospects: Record<string, IndexProspect[]>;
  /** Momento do build (ou da navegação) em que o motor foi consultado. */
  generatedAt: string;
};

const DESCRIPTION =
  "Preços de estacionamento em todos os aeroportos: diária avulsa, 7 e 15 dias, preço de " +
  "balcão e reserva online. O valor da tabela é o mesmo do checkout.";

/**
 * Tabela de um aeroporto no índice: até 5 estacionamentos. Vagas de parceiro
 * abrem a tabela com preço e Reservar; lotes mapeados sem contrato completam as
 * linhas sem preço (ADR-010, ADR-009: sem promessa de transação).
 */
function TabelaAeroporto({
  section,
  generatedAt,
}: {
  section: AirportSection;
  generatedAt: string;
}) {
  const { meta, dest, rows, mapeados, hiddenPartnerCount, hiddenProspectCount } = section;
  const nome = meta.short_name ?? meta.name;
  const summary = dest ? destinationSummary(dest, [1, 7, 15]) : null;
  const paginaPropria = dest ? `/precos/${meta.slug}` : `/destinos/${meta.slug}`;
  const vazio = rows.length === 0 && mapeados.length === 0;

  const partes: string[] = [];
  if (rows.length > 0) {
    partes.push(rows.length === 1 ? "1 vaga de parceiro" : `${rows.length} vagas de parceiros`);
    partes.push("ordenado pela diária mais baixa");
  }
  if (mapeados.length > 0) {
    partes.push(
      rows.length > 0
        ? `${mapeados.length} sem reserva online`
        : `${mapeados.length} ${mapeados.length === 1 ? "estacionamento mapeado" : "estacionamentos mapeados"} pela nossa equipe, sem reserva online ainda`,
    );
  }

  return (
    <section id={meta.slug} className="mt-12 scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="text-display-sm text-ink">
            <Link to={paginaPropria} className="hover:text-mp-primary">
              {nome}
            </Link>
          </h2>
          {partes.length > 0 && (
            <p className="mt-1 text-body-sm text-muted">{partes.join(" · ")}</p>
          )}
        </div>
        <Link
          to={paginaPropria}
          className="text-body-sm font-medium text-mp-indigo underline-offset-2 hover:underline"
        >
          {dest ? "Tabela completa" : "Página do destino"}
        </Link>
      </div>

      {vazio ? (
        <p className="mt-4 text-body-md text-body">
          Ainda estamos mapeando os estacionamentos deste aeroporto. Tem um estacionamento na
          região?{" "}
          <Link
            to="/seja-parceiro"
            className="font-medium text-mp-indigo underline-offset-2 hover:underline"
          >
            Seja parceiro Movepark
          </Link>
          .
        </p>
      ) : (
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
                <td className="order-1 col-span-3 tablet:table-cell tablet:border-b tablet:border-hairline tablet:py-3 tablet:pr-3 tablet:align-top">
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
                      cell.days === 1 ? "order-2" : cell.days === 7 ? "order-3" : "order-4",
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
                <td className="order-5 col-span-3 tablet:table-cell tablet:border-b tablet:border-hairline tablet:py-3 tablet:pl-3 tablet:text-right tablet:align-middle">
                  <Button asChild className="w-full tablet:w-auto">
                    <Link to={listingPath(row.unit)}>Reservar</Link>
                  </Button>
                </td>
              </tr>
            ))}

            {mapeados.map((p) => (
              <tr
                key={p.slug}
                className="grid grid-cols-3 gap-x-3 gap-y-3 rounded-lg border border-dashed border-hairline p-4 tablet:table-row tablet:border-0 tablet:p-0"
              >
                <td className="order-1 col-span-3 tablet:table-cell tablet:border-b tablet:border-hairline tablet:py-3 tablet:pr-3 tablet:align-top">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-title-sm text-ink">{p.name}</span>
                    <span className="text-caption-sm text-muted">
                      {p.distance_km != null && (
                        <>{formatDistance(Math.round(p.distance_km * 1000))} · </>
                      )}
                      mapeado pela Movepark · sem reserva online
                    </span>
                  </div>
                </td>
                <td
                  colSpan={3}
                  className="order-2 col-span-2 tablet:table-cell tablet:border-b tablet:border-hairline tablet:px-3 tablet:py-3 tablet:align-middle"
                >
                  <span className="block text-caption-sm text-muted">
                    consulte a tabela no local
                  </span>
                </td>
                <td className="order-3 justify-self-end tablet:table-cell tablet:border-b tablet:border-hairline tablet:py-3 tablet:pl-3 tablet:text-right tablet:align-middle">
                  <Link
                    to={`/estacionamentos/${meta.slug}/${p.slug}`}
                    className="text-body-sm font-medium text-mp-indigo underline-offset-2 hover:underline"
                  >
                    Ver ficha
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!vazio && (
        <p className="mt-3 text-caption-sm text-muted">
          {dest ? (
            <>
              Fonte: motor de reservas Movepark, o mesmo preço do checkout · conferido em{" "}
              <time dateTime={generatedAt}>{formatDate(generatedAt)}</time>
              {summary?.lastUpdated && (
                <>
                  {" "}
                  · tabela de parceiro mais recente de{" "}
                  <time dateTime={summary.lastUpdated}>{formatDate(summary.lastUpdated)}</time>
                </>
              )}
            </>
          ) : (
            <>Fichas mapeadas pela equipe Movepark, com endereço e distância conferidos.</>
          )}
          {hiddenPartnerCount > 0 && (
            <>
              {" · "}
              <Link
                to={paginaPropria}
                className="font-medium text-mp-indigo underline-offset-2 hover:underline"
              >
                mais {hiddenPartnerCount} {hiddenPartnerCount === 1 ? "vaga" : "vagas"} na tabela
                completa
              </Link>
            </>
          )}
          {hiddenProspectCount > 0 && (
            <>
              {" · "}
              <Link
                to={`/destinos/${meta.slug}`}
                className="font-medium text-mp-indigo underline-offset-2 hover:underline"
              >
                mais {hiddenProspectCount} na página do destino
              </Link>
            </>
          )}
        </p>
      )}
    </section>
  );
}

/**
 * Índice de preços (/precos): todos os aeroportos publicados, uma tabela por
 * aeroporto com até 5 estacionamentos (parceiros primeiro, com preço do motor;
 * lotes mapeados completam sem preço), e uma lateral de filtros para chegar
 * rápido no aeroporto certo. Pré-renderizado no build com os filtros vazios,
 * então o HTML sai completo para o crawler.
 */
export default function PrecosPage() {
  const loaded = useLoaderData() as PrecosIndexData | null;

  const [busca, setBusca] = React.useState("");
  const [uf, setUf] = React.useState<string | null>(null);
  const [soComReserva, setSoComReserva] = React.useState(false);
  const idBusca = React.useId();
  const idUf = React.useId();

  const sections = React.useMemo(
    () =>
      loaded ? buildAirportSections(loaded.aeroportos, loaded.data, loaded.prospects, 5) : [],
    [loaded],
  );

  if (!loaded || sections.length === 0) {
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

  const { data, aeroportos, generatedAt } = loaded;
  const filtro: AirportFilter = { busca, uf, soComReserva };
  const visiveis = sections.filter((s) => matchesAirportFilter(s, filtro));
  const filtrando = busca.trim() !== "" || uf != null || soComReserva;
  const ufs = airportStates(aeroportos);

  const stats = overallStats(data);
  const listados = sections.reduce((acc, s) => {
    const locais = new Set(s.rows.map((r) => `${r.unit.company_slug}/${r.unit.location_slug}`));
    return acc + locais.size + s.mapeados.length;
  }, 0);

  const canonical = `${SITE_URL}/precos`;
  const titulo = "Índice de preços de estacionamento";

  const breadcrumb = breadcrumbSchema([
    { name: "Início", url: SITE_URL },
    { name: "Índice de preços", url: canonical },
  ]);
  const lista = itemListSchema(
    sections.map((s) => ({
      name: `Preços de estacionamento em ${s.meta.short_name ?? s.meta.name}`,
      url: s.dest
        ? `${SITE_URL}/precos/${s.meta.slug}`
        : `${SITE_URL}/destinos/${s.meta.slug}`,
    })),
  );

  const limparFiltros = () => {
    setBusca("");
    setUf(null);
    setSoComReserva(false);
  };

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

      <div className="mx-auto w-full max-w-[1280px] px-4 py-12">
        <PageHeader
          variant="content"
          size="lg"
          title={titulo}
          description="Todos os aeroportos numa página: parceiros com reserva online no preço real do checkout e estacionamentos mapeados pela nossa equipe."
          contentClassName="max-w-[720px]"
        >
          <p className="text-caption-sm text-muted">
            Conferido no motor de reservas em{" "}
            <time dateTime={generatedAt}>{formatDate(generatedAt)}</time>
          </p>
        </PageHeader>

        {/* O retrato do índice em quatro números, direto do dado. */}
        <dl className="mt-8 grid grid-cols-2 gap-4 tablet:grid-cols-4">
          <div className="rounded-lg border border-hairline p-4">
            <dt className="text-caption-sm text-muted">Aeroportos no índice</dt>
            <dd className="mt-1 text-display-sm text-ink">{sections.length}</dd>
          </div>
          <div className="rounded-lg border border-hairline p-4">
            <dt className="text-caption-sm text-muted">Estacionamentos listados</dt>
            <dd className="mt-1 text-display-sm text-ink">{listados}</dd>
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

        <div className="mt-10 grid grid-cols-1 gap-8 desktop:grid-cols-[280px_minmax(0,1fr)] desktop:gap-12">
          {/* Lateral de filtros: busca, estado e reserva online, mais o atalho
              por aeroporto. No mobile ela abre a lista; no desktop fica fixa. */}
          <aside
            aria-label="Filtros do índice"
            className="desktop:sticky desktop:top-24 desktop:max-h-[calc(100vh-7rem)] desktop:self-start desktop:overflow-y-auto"
          >
            <div className="rounded-lg border border-hairline p-4">
              <h2 className="text-title-md text-ink">Filtrar</h2>

              <div className="mt-3 flex flex-col gap-1.5">
                <label htmlFor={idBusca} className="text-caption-sm font-medium text-muted">
                  Buscar aeroporto
                </label>
                <input
                  id={idBusca}
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nome, cidade ou código"
                  className="h-12 w-full rounded-sm border border-hairline bg-canvas px-3 text-body-md text-ink focus:border-mp-primary focus:outline-none"
                />
              </div>

              <div className="mt-3 flex flex-col gap-1.5">
                <label htmlFor={idUf} className="text-caption-sm font-medium text-muted">
                  Estado
                </label>
                <select
                  id={idUf}
                  value={uf ?? ""}
                  onChange={(e) => setUf(e.target.value === "" ? null : e.target.value)}
                  className="h-12 w-full rounded-sm border border-hairline bg-canvas px-3 text-body-md text-ink focus:border-mp-primary focus:outline-none"
                >
                  <option value="">Todos os estados</option>
                  {ufs.map((sigla) => (
                    <option key={sigla} value={sigla}>
                      {sigla}
                    </option>
                  ))}
                </select>
              </div>

              <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-body-sm text-ink">
                <input
                  type="checkbox"
                  checked={soComReserva}
                  onChange={(e) => setSoComReserva(e.target.checked)}
                  className="h-4 w-4 accent-mp-primary"
                />
                Só com reserva online
              </label>

              <p className="mt-4 text-caption-sm text-muted" role="status">
                {visiveis.length} de {sections.length} aeroportos
              </p>
              {filtrando && (
                <button
                  type="button"
                  onClick={limparFiltros}
                  className="mt-1 text-body-sm font-medium text-mp-indigo underline-offset-2 hover:underline"
                >
                  Limpar filtros
                </button>
              )}
            </div>

            <nav aria-label="Aeroportos desta página" className="mt-4 hidden desktop:block">
              <h2 className="px-1 text-caption-sm font-medium text-muted">Ir para o aeroporto</h2>
              <ul className="mt-2 flex flex-col gap-0.5">
                {visiveis.map((s) => (
                  <li key={s.meta.slug}>
                    <a
                      href={`#${s.meta.slug}`}
                      className="flex items-baseline justify-between gap-2 rounded-sm px-1 py-1 text-body-sm text-ink transition hover:text-mp-primary"
                    >
                      <span className="min-w-0 truncate">{s.meta.short_name ?? s.meta.name}</span>
                      {s.rows.length + s.mapeados.length > 0 && (
                        <span className="shrink-0 text-caption-sm tabular-nums text-muted">
                          {s.rows.length + s.mapeados.length}
                        </span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <div className="min-w-0">
            {/* Atalhos no mobile, onde a lateral não acompanha a rolagem. */}
            <nav aria-label="Aeroportos desta página" className="desktop:hidden">
              <ul className="flex flex-wrap gap-2">
                {visiveis.map((s) => (
                  <li key={s.meta.slug}>
                    <a
                      href={`#${s.meta.slug}`}
                      className="inline-block rounded-full border border-hairline px-3 py-1.5 text-body-sm text-ink transition hover:border-mp-primary hover:text-mp-primary"
                    >
                      {s.meta.short_name ?? s.meta.name}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {visiveis.length === 0 ? (
              <div className="mt-12">
                <p className="text-body-md text-body">Nenhum aeroporto com esse filtro.</p>
                <button
                  type="button"
                  onClick={limparFiltros}
                  className="mt-2 text-body-sm font-medium text-mp-indigo underline-offset-2 hover:underline"
                >
                  Limpar filtros
                </button>
              </div>
            ) : (
              visiveis.map((s) => (
                <TabelaAeroporto key={s.meta.slug} section={s} generatedAt={generatedAt} />
              ))
            )}

            <section className="mt-12 max-w-[720px]">
              <h2 className="text-display-sm text-ink">De onde vêm estes preços</h2>
              <p className="mt-3 text-body-md text-body">
                Do motor de preços da Movepark, o mesmo que calcula sua reserva. O valor que
                aparece aqui é o cobrado no checkout e muda junto com a tabela de cada parceiro,
                com a data da última atualização à vista.
              </p>
              <p className="mt-3 text-body-md text-body">
                Nada fica sob consulta: se o estacionamento tem preço na tabela, dá para reservar
                por aquele valor. O preço riscado é o balcão, a tarifa de quem chega sem reserva.
                Quando reservar online sai mais barato, a economia aparece na própria célula.
              </p>
              <p className="mt-3 text-body-md text-body">
                Estacionamento sem reserva online é ficha mapeada pela nossa equipe: a ficha traz
                endereço e distância, e o preço é a tabela do local. Alguns parceiros só aceitam
                entrada a partir de 2 ou 3 diárias; nesses casos a tabela mostra a regra no lugar
                do preço. A tabela completa de cada destino traz também o total de 30 diárias.
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
        </div>
      </div>
    </>
  );
}
