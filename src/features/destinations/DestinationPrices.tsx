import { Link } from "react-router-dom";

import { formatBRL, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { durationLabel, listingPath } from "@/features/price-index/priceIndex.logic";

import type { DestinoPrices, ProximityRow } from "./destinoPrices.logic";

/**
 * A tabela de preços da página de destino e o ranking de distância.
 *
 * Os dois blocos saem no HTML do build, com os números do motor. Antes disso a
 * página respondia "quanto custa" só em prosa dentro de um accordion de FAQ, e a
 * consulta de preço é justamente a de maior intenção comercial do destino.
 *
 * O layout difere do de /precos/<slug> de propósito (lá a tabela é o produto da
 * página, aqui é uma seção dela). Os NÚMEROS vêm do mesmo `buildMatrix`, então as
 * duas páginas não conseguem divergir.
 */

type Props = {
  prices: DestinoPrices;
  /** Data em que o build consultou o motor. */
  generatedAt: string;
  /** Slug do destino, para o link da tabela completa. */
  destinationSlug: string;
  heading: string;
};

export function DestinationPriceTable({ prices, generatedAt, destinationSlug, heading }: Props) {
  const { matrix, summary, longStay, lastUpdated } = prices;
  if (matrix.rows.length === 0) return null;
  const temMinStay = matrix.rows.some((r) => r.cells.some((c) => c.minStayDays != null));
  const temBalcao = matrix.rows.some((r) => r.cells.some((c) => c.oldTotal != null));

  return (
    <section className="mt-10">
      <h2 className="mb-4 text-balance text-display-md text-ink">{heading}</h2>

      {/* Resposta rápida: o menor preço por duração, extraível por buscador e IA
          sem depender de ler a tabela inteira. */}
      {summary.byDuration.length > 0 && (
        <div className="rounded-lg bg-mp-pale p-5 tablet:p-6">
          <ul className="space-y-2">
            {summary.byDuration.map((s) => (
              <li key={s.days} className="text-body-md text-body">
                <strong className="font-semibold text-ink">{durationLabel(s.days)}:</strong> a
                partir de {formatBRL(s.from)} no {s.unitLabel} ({s.parkingTypeName}
                {s.days > 1 && <>, {formatBRL(s.fromPerDay)} por diária</>})
              </li>
            ))}
          </ul>
          {longStay && (
            <p className="mt-3 text-body-md text-body">
              No {longStay.unitLabel}, a diária cai de {formatBRL(longStay.perDayFrom)} para{" "}
              {formatBRL(longStay.perDayTo)} ({longStay.dropPct}% menos) quando a estadia vai de{" "}
              {longStay.fromDays} para {longStay.toDays} diárias.
            </p>
          )}
        </div>
      )}

      <table className="mt-6 block w-full border-collapse tablet:table">
        <caption className="sr-only">
          Preços por duração nos estacionamentos parceiros, total do período
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
          </tr>
        </thead>
        <tbody className="block space-y-3 tablet:table-row-group">
          {matrix.rows.map((row) => (
            <tr
              key={row.key}
              className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-hairline p-4 tablet:table-row tablet:border-0 tablet:p-0"
            >
              <th
                scope="row"
                className="col-span-2 text-left font-normal tablet:table-cell tablet:border-b tablet:border-hairline tablet:py-3 tablet:pr-3 tablet:align-top"
              >
                <Link
                  to={listingPath(row.unit)}
                  className="text-title-sm text-ink underline-offset-2 hover:text-mp-primary hover:underline"
                >
                  {row.label}
                </Link>
                <span className="block text-caption-sm text-muted">
                  {row.unit.parking_type_name}
                  {row.unit.has_shuttle && <> · traslado</>}
                </span>
              </th>
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
            </tr>
          ))}
        </tbody>
      </table>

      {/* Procedência. O concorrente cita "site oficial da operadora" e erra a data em
          três lugares da mesma página; aqui a fonte é o próprio motor que calcula a
          reserva, e a data sai de um carimbo, não de um texto escrito à mão.

          A frase NÃO promete "o valor cobrado no checkout": em unidade com
          `checkout_mode = external` quem cobra é o parceiro, e prometer o checkout
          da Movepark ali seria promessa de transação sem capacidade (ADR-009). */}
      <p className="mt-3 text-caption-sm text-muted">
        {temBalcao && <>Preço riscado: balcão do estacionamento, sem reserva. </>}
        {temMinStay && (
          <>
            Onde aparece a entrada mínima, o parceiro só aceita estadias a partir daquele número de
            diárias.{" "}
          </>
        )}
        Conferido no motor de reservas em{" "}
        <time dateTime={generatedAt}>{formatDate(generatedAt)}</time>
        {lastUpdated && (
          <>
            {" "}
            · tabela de parceiro mais recente de{" "}
            <time dateTime={lastUpdated}>{formatDate(lastUpdated)}</time>
          </>
        )}
        .
      </p>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        <Link
          to={`/precos/${destinationSlug}`}
          className="text-body-sm font-medium text-mp-primary underline-offset-2 hover:underline"
        >
          Ver a tabela completa de preços
        </Link>
        <Link
          to="/metodologia"
          className="text-body-sm font-medium text-mp-indigo underline-offset-2 hover:underline"
        >
          Como a Movepark apura preço e distância
        </Link>
      </div>
    </section>
  );
}

/**
 * Ranking de distância, medido no Postgres com PostGIS (ADR-001).
 *
 * Vale a seção porque é dado que o comparador concorrente digita à mão e erra: para
 * a mesma unidade em Viracopos ele publica 4,5 km e a nossa geodésica mede 1,3 km.
 * Lote mapeado entra na mesma lista, marcado, porque distância é fato do lugar e
 * vale independentemente de dar para reservar (ADR-010).
 */
export function DestinationProximity({
  rows,
  heading,
}: {
  rows: ProximityRow[];
  heading: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="mb-2 text-balance text-display-md text-ink">{heading}</h2>
      <p className="mb-4 text-body-md text-muted">
        Medimos a distância a partir das coordenadas de cada endereço. Nenhum número desta lista é
        declarado pelo estacionamento.
      </p>
      <ul className="divide-y divide-hairline border-y border-hairline">
        {rows.map((row) => (
          <li key={row.key} className="flex flex-wrap items-baseline justify-between gap-x-4 py-3">
            <span className="text-body-md text-ink">
              <Link to={row.path} className="underline-offset-2 hover:text-mp-primary hover:underline">
                {row.name}
              </Link>
              {row.detail && <span className="text-caption-sm text-muted"> · {row.detail}</span>}
            </span>
            <span className="text-body-md tabular-nums text-body">{row.distanceLabel}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
