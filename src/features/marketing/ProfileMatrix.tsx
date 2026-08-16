import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MarketingProfileMatrix } from "@/types/domain";
import { COHORTS, GROWTH_STAGES, cohortTone, share, toneClasses } from "./cohorts";

type Props = {
  data: MarketingProfileMatrix | undefined;
  isLoading: boolean;
};

/**
 * Matriz de perfis: quem são os clientes de cada estacionamento e como se comportam.
 *
 * A leitura é por coorte, e cada linha traz o que decide uma ação: quantas pessoas, quanto elas
 * valem, e há quanto tempo sumiram. Uma tabela de contagem pura não responde "onde eu mexo".
 */
export function ProfileMatrix({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 tablet:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
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
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 tablet:grid-cols-4">
        <Kpi label="Contatos" value={String(totals.contacts)} sub={`${totals.customers} já compraram`} />
        <Kpi label="Receita" value={formatBRL(totals.revenue)} sub={`${totals.bookings} reservas pagas`} />
        <Kpi label="Ticket médio" value={formatBRL(totals.avg_ticket)} sub="por reserva paga" />
        <Kpi
          label="Candidatos a assinante"
          value={String(totals.subscription_candidates)}
          sub={`${share(totals.subscription_candidates, totals.contacts)}% da base`}
          destaque
        />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div>
            <h3 className="font-medium text-body text-ink">Perfis de cliente</h3>
            <p className="text-sm text-muted">
              Cada linha é um comportamento de compra. A dica diz o que fazer com o grupo.
            </p>
          </div>
          <div className="overflow-x-auto rounded-md border border-hairline bg-canvas">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Perfil</TableHead>
                  <TableHead className="text-right">Contatos</TableHead>
                  <TableHead className="text-right">% da base</TableHead>
                  <TableHead className="text-right">Reservas</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">Ticket médio</TableHead>
                  <TableHead className="text-right">Dias sem comprar</TableHead>
                  <TableHead className="text-right">Assinante em potencial</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cohorts.map((row) => {
                  const info = COHORTS[row.cohort];
                  return (
                    <TableRow key={row.cohort}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={cn(
                              "w-fit rounded-full border px-2 py-0.5 text-xs font-medium",
                              toneClasses(cohortTone(row.cohort)),
                            )}
                          >
                            {info?.label ?? row.cohort}
                          </span>
                          <span className="text-xs text-muted">{info?.hint}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-ink">{row.contacts}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted">
                        {share(row.contacts, totals.contacts)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted">{row.bookings}</TableCell>
                      <TableCell className="text-right tabular-nums text-ink">
                        {formatBRL(row.revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted">
                        {formatBRL(row.avg_ticket)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted">
                        {row.avg_days_since_last ?? "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted">
                        {row.subscription_candidates}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 desktop:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <div>
              <h3 className="font-medium text-body text-ink">Growth</h3>
              <p className="text-sm text-muted">Aquisição, ativação, retenção e quem precisa voltar.</p>
            </div>
            <div className="flex flex-col gap-3">
              {stages.map((row) => (
                <div key={row.stage} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-ink">
                      {GROWTH_STAGES[row.stage]?.label ?? row.stage}
                    </span>
                    <span className="text-sm tabular-nums text-muted">
                      {row.contacts} · {formatBRL(row.revenue)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-soft">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${share(row.contacts, totals.contacts)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted">{GROWTH_STAGES[row.stage]?.hint}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <div>
              <h3 className="font-medium text-body text-ink">Por estacionamento</h3>
              <p className="text-sm text-muted">
                Onde cada contato reservou por último, com quantos voltaram.
              </p>
            </div>
            {locations.length === 0 ? (
              <EmptyState title="Sem reservas no recorte" />
            ) : (
              <div className="overflow-x-auto rounded-md border border-hairline bg-canvas">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Unidade</TableHead>
                      <TableHead className="text-right">Contatos</TableHead>
                      <TableHead className="text-right">Recorrentes</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {locations.map((row) => (
                      <TableRow key={row.location_id}>
                        <TableCell className="text-ink">{row.location_name}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.contacts}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted">
                          {row.recurring} ({share(row.recurring, row.contacts)}%)
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-ink">
                          {formatBRL(row.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  destaque,
}: {
  label: string;
  value: string;
  sub?: string;
  destaque?: boolean;
}) {
  return (
    <Card className={cn(destaque && "border-primary/40")}>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-sm text-muted">{label}</span>
        <span className="text-2xl font-semibold tabular-nums text-ink">{value}</span>
        {sub && <span className="text-xs text-muted">{sub}</span>}
      </CardContent>
    </Card>
  );
}
