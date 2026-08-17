import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { Panel, PanelTitle } from "@/components/shared/Panel";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MarketingProfileMatrix } from "@/types/domain";
import { COHORTS, GROWTH_STAGES, cohortTone, share, toneClasses } from "./cohorts";

type Props = {
  data: MarketingProfileMatrix | undefined;
  isLoading: boolean;
};

const int = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("pt-BR");

const COLUNAS = [
  "Contatos",
  "% da base",
  "Reservas",
  "Receita",
  "Ticket médio",
  "Dias sem comprar",
  "Assinante em potencial",
];

/**
 * Matriz de perfis: quem são os clientes de cada estacionamento e como se comportam.
 *
 * A leitura é por coorte, e cada linha traz o que decide uma ação: quantas pessoas, quanto valem,
 * e há quanto tempo sumiram. Uma tabela de contagem pura não responde "onde eu mexo".
 *
 * Visual no padrão da home do Manager: `Panel` (card sem borda, cantos de 20px, padding 28), título
 * em `title-md`, número em `display-xl` e apoio em `body-sm`. Os tokens de tipografia são os do
 * design system, e não `text-2xl`/`text-sm` soltos, que era o que fazia esta tela destoar do resto
 * do painel.
 */
export function ProfileMatrix({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid gap-5 tablet:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-80 w-full rounded-lg" />
      </div>
    );
  }

  const totals = data?.totals;
  const cohorts = data?.by_cohort ?? [];
  const stages = data?.by_growth_stage ?? [];
  const locations = data?.by_location ?? [];

  if (!totals || totals.contacts === 0) {
    return (
      <EmptyState
        title="Nenhum contato no recorte"
        description="Troque o estacionamento no filtro, ou sincronize os contatos para trazer quem já reservou."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 tablet:grid-cols-2 desktop:grid-cols-4">
        <Numero
          titulo="Contatos"
          valor={int(totals.contacts)}
          apoio={`${int(totals.customers)} já compraram`}
        />
        <Numero
          titulo="Receita"
          valor={formatBRL(totals.revenue)}
          apoio={`${int(totals.bookings)} reservas pagas`}
        />
        <Numero
          titulo="Ticket médio"
          valor={formatBRL(totals.avg_ticket)}
          apoio="por reserva paga"
        />
        <Numero
          titulo="Candidatos a assinante"
          valor={int(totals.subscription_candidates)}
          apoio={`${share(totals.subscription_candidates, totals.contacts)}% da base`}
          destaque
        />
      </div>

      <Panel>
        <PanelTitle aside={`${int(totals.contacts)} contatos`}>Perfis de cliente</PanelTitle>
        <p className="mt-1.5 text-body-sm text-muted">
          Cada linha é um comportamento de compra. A dica diz o que fazer com o grupo.
        </p>

        {/*
          Tabela de verdade, e não lista de blocos: são sete números por linha, e o valor de ler
          isto é comparar a mesma coluna entre as coortes. Numa lista com quebra, "Dias sem comprar"
          cai em posição diferente a cada linha e a comparação some.
        */}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-hairline">
                <th className="pb-3 pr-4 text-left text-caption font-medium text-muted-soft">
                  Perfil
                </th>
                {COLUNAS.map((c) => (
                  <th
                    key={c}
                    className="whitespace-nowrap pb-3 pl-4 text-right text-caption font-medium text-muted-soft"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((row) => {
                const info = COHORTS[row.cohort];
                return (
                  <tr key={row.cohort} className="border-b border-hairline last:border-b-0">
                    <td className="py-4 pr-4 align-top">
                      <span
                        className={cn(
                          "inline-block rounded-full border px-2 py-0.5 text-caption-sm font-medium",
                          toneClasses(cohortTone(row.cohort)),
                        )}
                      >
                        {info?.label ?? row.cohort}
                      </span>
                      <p className="mt-1 max-w-[280px] text-caption text-muted">{info?.hint}</p>
                    </td>
                    <Num>{int(row.contacts)}</Num>
                    <Num>{share(row.contacts, totals.contacts)}%</Num>
                    <Num>{int(row.bookings)}</Num>
                    <Num forte>{formatBRL(row.revenue)}</Num>
                    <Num>{formatBRL(row.avg_ticket)}</Num>
                    <Num>
                      {row.avg_days_since_last == null ? "-" : int(row.avg_days_since_last)}
                    </Num>
                    <Num>{int(row.subscription_candidates)}</Num>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-5 desktop:grid-cols-2">
        <Panel>
          <PanelTitle>Growth</PanelTitle>
          <p className="mt-1.5 text-body-sm text-muted">
            Aquisição, ativação, retenção e quem precisa voltar.
          </p>
          <div className="mt-5 flex flex-col gap-4">
            {stages.map((row) => (
              <div key={row.stage} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-body-sm font-medium text-ink">
                    {GROWTH_STAGES[row.stage]?.label ?? row.stage}
                  </span>
                  <span className="text-body-sm tabular-nums text-muted">
                    {int(row.contacts)} · {formatBRL(row.revenue)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-strong">
                  <div
                    className="h-full rounded-full bg-mp-primary"
                    style={{ width: `${share(row.contacts, totals.contacts)}%` }}
                  />
                </div>
                <span className="text-caption text-muted-soft">
                  {GROWTH_STAGES[row.stage]?.hint}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelTitle>Por estacionamento</PanelTitle>
          <p className="mt-1.5 text-body-sm text-muted">
            Onde cada contato reservou por último, com quantos voltaram.
          </p>
          {locations.length === 0 ? (
            <p className="mt-5 py-4 text-body-sm text-muted">Sem reservas no recorte.</p>
          ) : (
            <div className="mt-5 flex flex-col gap-0.5">
              {locations.map((row) => (
                <div key={row.location_id} className="flex items-center gap-3 py-2.5">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      Number(row.revenue) > 0 ? "bg-mp-primary" : "bg-surface-strong",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate text-body-sm text-body">
                    {row.location_name}
                  </span>
                  <span className="whitespace-nowrap text-caption text-muted-soft">
                    {int(row.recurring)} de {int(row.contacts)} voltaram
                  </span>
                  <span
                    className={cn(
                      "ml-auto whitespace-nowrap text-body-sm font-bold tabular-nums",
                      Number(row.revenue) > 0 ? "text-ink" : "text-muted-soft",
                    )}
                  >
                    {formatBRL(row.revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Numero({
  titulo,
  valor,
  apoio,
  destaque,
}: {
  titulo: string;
  valor: string;
  apoio?: string;
  destaque?: boolean;
}) {
  return (
    <Panel className={cn(destaque && "ring-1 ring-inset ring-mp-primary/25")}>
      <PanelTitle>{titulo}</PanelTitle>
      <div
        className={cn(
          "mt-4 whitespace-nowrap text-display-xl tabular-nums leading-none",
          destaque ? "text-mp-primary" : "text-ink",
        )}
      >
        {valor}
      </div>
      {apoio && <div className="mt-1.5 text-body-sm text-muted">{apoio}</div>}
    </Panel>
  );
}

/** Célula numérica da tabela de coortes. Alinhada à direita e tabular, para comparar coluna. */
function Num({ children, forte }: { children: React.ReactNode; forte?: boolean }) {
  return (
    <td
      className={cn(
        "whitespace-nowrap py-4 pl-4 text-right align-top tabular-nums",
        forte ? "text-body-sm font-bold text-ink" : "text-body-sm text-body",
      )}
    >
      {children}
    </td>
  );
}
