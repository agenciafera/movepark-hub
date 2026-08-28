import * as React from "react";
import { Link } from "react-router-dom";

import { RatingBadge } from "@/features/reviews/RatingStars";
import { formatBRL, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  durationLabel,
  listingPath,
  sortRowsByPeriod,
} from "@/features/price-index/priceIndex.logic";

import type { DestinoPrices, ProximityRow } from "./destinoPrices.logic";
import { caminhoPrecos } from "@/lib/urls";

/**
 * A tabela de preços da página de destino e a lista de proximidade.
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

/** O período que abre a seção. 7 diárias é a compra mais comum. */
const PERIODO_PADRAO = 7;

export function DestinationPriceTable({ prices, generatedAt, destinationSlug, heading }: Props) {
  const { matrix, summary, longStay, lastUpdated } = prices;
  const dias = matrix.days;
  const [periodo, setPeriodo] = React.useState(
    dias.includes(PERIODO_PADRAO) ? PERIODO_PADRAO : (dias[0] ?? PERIODO_PADRAO),
  );
  const grupoId = React.useId();

  if (matrix.rows.length === 0) return null;
  const temMinStay = matrix.rows.some((r) => r.cells.some((c) => c.minStayDays != null));
  const temBalcao = matrix.rows.some((r) => r.cells.some((c) => c.oldTotal != null));
  const linhas = sortRowsByPeriod(matrix.rows, periodo);

  return (
    <>
      <div className="flex max-w-[68ch] flex-col gap-2">
        <h2 className="text-balance text-display-2xl text-ink">{heading}</h2>
        <p className="text-pretty text-body-md text-body">
          Escolha a duração da estadia e compare o total nas vagas com reserva online.
        </p>
      </div>

      {/* Resposta rápida: o menor preço por duração, extraível por buscador e IA
          sem depender de ler a tabela inteira. */}
      {summary.byDuration.length > 0 && (
        <div className="mt-6 rounded-lg bg-canvas p-5 tablet:p-6">
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

      <div className="mt-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex flex-col gap-1.5">
          <span id={grupoId} className="text-caption font-semibold text-ink">
            Mostrar preço de
          </span>
          <div role="group" aria-labelledby={grupoId} className="flex flex-wrap gap-2">
            {dias.map((d) => {
              const on = d === periodo;
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPeriodo(d)}
                  className={cn(
                    "rounded-full border px-4 py-2.5 text-button-sm transition",
                    on
                      ? "border-mp-navy bg-mp-navy text-white"
                      : "border-hairline bg-canvas text-body hover:border-mp-navy",
                  )}
                >
                  {durationLabel(d)}
                </button>
              );
            })}
          </div>
        </div>
        <span className="text-caption-sm text-muted">Total do período, com reserva online</span>
      </div>

      {/* Tabela no desktop, cartão empilhado no mobile: o mesmo desenho que a página já
          usava, porque três colunas de número em 375px cortam justamente o preço.

          O período inativo continua no DOM, escondido: a página é pré-renderizada num
          período só, e desmontar os outros tiraria a maior parte dos preços do HTML que
          buscador e crawler de IA leem. A classe de display é condicional (`hidden` ou
          `block tablet:table-cell`), e não o atributo `hidden`, porque o atributo perde
          para qualquer `tablet:table-cell` que venha de media query. */}
      <div className="mt-4 rounded-md tablet:border tablet:border-hairline tablet:bg-canvas">
        <table className="block w-full border-collapse tablet:table">
          <caption className="sr-only">
            Preço por duração nos estacionamentos com reserva online, total do período
          </caption>
          <thead className="hidden tablet:table-header-group">
            <tr className="border-b border-hairline">
              <th
                scope="col"
                className="px-5 py-3 text-left text-caption-sm font-medium text-muted"
              >
                Estacionamento
              </th>
              {dias.map((d) => (
                <React.Fragment key={d}>
                  <th
                    scope="col"
                    className={cn(
                      "px-5 py-3 text-right text-caption-sm font-medium text-muted",
                      d !== periodo && "hidden",
                    )}
                  >
                    Total {durationLabel(d)}
                  </th>
                  <th
                    scope="col"
                    className={cn(
                      "px-5 py-3 text-right text-caption-sm font-medium text-muted",
                      d !== periodo && "hidden",
                    )}
                  >
                    Por diária
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="block space-y-3 tablet:table-row-group tablet:space-y-0">
            {linhas.map((row) => {
              const melhor = row.cells.find((c) => c.days === periodo)?.isCheapest ?? false;
              return (
                <tr
                  key={row.key}
                  className={cn(
                    "grid grid-cols-2 gap-x-4 gap-y-3 rounded-md border border-hairline bg-canvas p-4",
                    "tablet:table-row tablet:border-0 tablet:border-b tablet:border-hairline-soft tablet:p-0 tablet:last:border-b-0",
                    melhor && "bg-mp-pale",
                  )}
                >
                  <th
                    scope="row"
                    className="col-span-2 text-left align-top font-normal tablet:table-cell tablet:px-5 tablet:py-4"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <Link
                        to={listingPath(row.unit)}
                        className="text-title-md text-ink underline-offset-2 hover:text-mp-primary hover:underline"
                      >
                        {row.label}
                      </Link>
                      {melhor && (
                        <span className="rounded-full bg-mp-teal px-2 py-0.5 text-badge uppercase tracking-[0.4px] text-mp-navy">
                          Melhor preço
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-caption-sm text-muted">
                      {row.unit.parking_type_name}
                    </span>
                  </th>

                  {row.cells.map((cell) => {
                    const ativo = cell.days === periodo;
                    return (
                      <React.Fragment key={cell.days}>
                        <td
                          className={cn(
                            ativo
                              ? "block align-top tablet:table-cell tablet:px-5 tablet:py-4 tablet:text-right"
                              : "hidden",
                          )}
                        >
                          <span className="block text-caption-sm text-muted tablet:hidden">
                            Total {durationLabel(cell.days)}
                          </span>
                          {cell.total != null ? (
                            <>
                              <span className="block text-display-sm tabular-nums text-ink">
                                {formatBRL(cell.total)}
                              </span>
                              {cell.oldTotal != null && (
                                <span className="block text-caption-sm tabular-nums text-muted-soft line-through">
                                  {formatBRL(cell.oldTotal)}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="block text-caption-sm text-muted">
                              {cell.minStayDays != null
                                ? `entrada a partir de ${cell.minStayDays} diárias`
                                : "ver na página"}
                            </span>
                          )}
                        </td>
                        <td
                          className={cn(
                            ativo
                              ? "block text-right align-top tablet:table-cell tablet:px-5 tablet:py-4"
                              : "hidden",
                          )}
                        >
                          <span className="block text-caption-sm text-muted tablet:hidden">
                            Por diária
                          </span>
                          {cell.total != null ? (
                            <>
                              <span className="block text-title-md tabular-nums text-ink">
                                {formatBRL(cell.perDay ?? cell.total)}
                                {cell.days > 1 && <span className="sr-only"> por diária</span>}
                              </span>
                              {cell.economyPct != null && (
                                <span className="block text-caption-sm font-medium text-success">
                                  {cell.economyPct}% menor online
                                </span>
                              )}
                            </>
                          ) : null}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        {/* Procedência. O concorrente cita "site oficial da operadora" e erra a data em
            três lugares da mesma página; aqui a fonte é o próprio motor que calcula a
            reserva, e a data sai de um carimbo, não de um texto escrito à mão.

            A frase NÃO promete "o valor cobrado no checkout": em unidade com
            `checkout_mode = external` quem cobra é o parceiro, e prometer o checkout
            da Movepark ali seria promessa de transação sem capacidade (ADR-009). */}
        <p className="max-w-[64ch] text-pretty text-caption-sm text-muted">
          {temBalcao && <>Preço riscado: balcão do estacionamento, sem reserva. </>}
          {temMinStay && (
            <>
              Onde aparece a entrada mínima, o parceiro só aceita estadias a partir daquele número
              de diárias.{" "}
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

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link
            to={caminhoPrecos(destinationSlug)}
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
      </div>
    </>
  );
}

/**
 * Todos os estacionamentos da região, ordenados por distância medida.
 *
 * É a ÚNICA lista de lotes mapeados da página desde o redesenho de 19/08/2026. Antes
 * eles apareciam duas vezes: em cards com endereço e nota, e de novo aqui só com o
 * nome e a distância. Quem lia a página via o mesmo lote duas vezes, com informação
 * diferente em cada aparição, e a segunda lista parecia um resumo quebrado da
 * primeira.
 *
 * O que a fusão preserva do card antigo, e por quê:
 *
 * - **O selo.** "Reserva online" no parceiro e "Sem reserva online" no mapeado são
 *   TEXTO no HTML, não tooltip: é a frase que explica por que uma linha leva a uma
 *   página com preço e a outra não (E0.17-d).
 * - **A nota do Google, quando fresca.** Avaliação de terceiro é fato do lugar, não
 *   promessa de transação, e cabe no ADR-009. Sai rotulada "no Google" para ninguém
 *   ler como nota de quem reservou pela Movepark. Nota Movepark é impossível no lote
 *   mapeado por desenho: `review.booking_id` é `NOT NULL`.
 * - **O único link é a página do lote no Hub**, nunca o site nem o motor de reserva
 *   do parceiro. No dia em que ele abre o Analytics e vê referral da Movepark, está
 *   recebendo de graça o que íamos cobrar.
 *
 * A distância é medida no Postgres com PostGIS (ADR-001) e nenhum número aqui é
 * declarado pelo estacionamento. Vale a seção porque é o dado que o comparador
 * concorrente digita à mão e erra: para a mesma unidade em Viracopos ele publica
 * 4,5 km e a nossa geodésica mede 1,3 km.
 */
export function DestinationProximity({
  rows,
  heading,
  lead,
}: {
  rows: ProximityRow[];
  heading: string;
  lead?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <>
      <div className="flex max-w-[68ch] flex-col gap-2">
        <h2 className="text-balance text-display-2xl text-ink">{heading}</h2>
        <p className="text-pretty text-body-md text-body">
          {lead ??
            "Medimos a distância a partir das coordenadas de cada endereço. Nenhum número desta lista é declarado pelo estacionamento."}
        </p>
      </div>

      <ul className="mt-6 border-t border-hairline">
        {rows.map((row) => (
          <li
            key={row.key}
            data-testid="proximity-row"
            data-kind={row.kind}
            className="relative grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-1 border-b border-hairline-soft py-4 transition focus-within:bg-surface-soft hover:bg-surface-soft desktop:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto]"
          >
            <span className="flex flex-wrap items-center gap-2">
              {/* A linha inteira é clicável, e o alvo vem de um `::after` esticado, não de
                  um `<Link>` em volta de tudo: assim o texto âncora continua sendo só o
                  nome do lote. Link engolindo endereço, distância e selo vira âncora
                  poluída, que é o oposto do que esta lista existe para fazer. */}
              <Link
                to={row.path}
                className="text-title-md text-ink underline-offset-2 after:absolute after:inset-0 after:content-[''] hover:text-mp-primary hover:underline"
              >
                {row.name}
              </Link>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-1 text-badge",
                  row.kind === "partner"
                    ? "border-mp-indigo/30 text-mp-indigo"
                    : "border-hairline text-muted",
                )}
              >
                {row.kind === "partner" ? "Reserva online" : "Sem reserva online"}
              </span>
            </span>

            {/* No mobile o endereço desce para a segunda linha e a distância fica ao lado
                do nome, que é a comparação que a pessoa faz rolando a lista. No desktop os
                três voltam para a mesma linha. */}
            <span className="col-span-2 row-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted desktop:col-span-1 desktop:col-start-2 desktop:row-start-1">
              {row.address && <span className="text-pretty">{row.address}</span>}
              {row.rating && (
                <RatingBadge
                  avg={row.rating.avg}
                  count={row.rating.count}
                  className="text-body-sm"
                  suffix="no Google"
                />
              )}
            </span>

            <span className="col-start-2 row-start-1 text-right text-body-md tabular-nums text-ink desktop:col-start-3">
              {row.distanceLabel ?? "sem distância medida"}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
