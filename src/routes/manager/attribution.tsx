import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { useManagerFilters } from "@/features/manager-filters/context";
import { ManagerFilterBar } from "@/features/manager-filters/ManagerFilterBar";
import { formatRangeLabel } from "@/features/manager-filters/managerFilters.logic";
import { useBookingAttribution, useExternalExitClicks } from "@/features/attribution/api";
import { useWlRevenue } from "@/features/finance/wlRevenue";
import { formatDateTime } from "@/lib/format";

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

export default function ManagerAttribution() {
  const { range, scopedLocationIds } = useManagerFilters();
  const { data, isLoading } = useBookingAttribution(
    range.from.toISOString(),
    range.to.toISOString(),
    scopedLocationIds,
  );
  const hubTotals = data?.totals ?? { hub: 0, external: 0, total: 0 };
  // O site white-label do parceiro é origem própria (reservas-unificadas-hub-wl.md § 7): pedidos
  // criados no site no mesmo recorte, pela data da compra como o resto da página.
  const wlQ = useWlRevenue({
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    locationIds: scopedLocationIds,
    dateField: "created_at",
  });
  const site = wlQ.data?.total.created ?? 0;
  const total = hubTotals.total + site;

  // A outra ponta: quem saiu para reservar no parceiro. Mesmo período e mesmo recorte de unidade
  // da barra de filtros, senão as duas metades da página falariam de conjuntos diferentes.
  const exitClicks = useExternalExitClicks(
    range.from.toISOString(),
    range.to.toISOString(),
    scopedLocationIds,
  );
  const exitTotals = (exitClicks.data ?? []).reduce(
    (acc, r) => ({ clicks: acc.clicks + r.clicks, sessions: acc.sessions + r.sessions }),
    { clicks: 0, sessions: 0 },
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Atribuição"
        description={`De onde vieram as reservas criadas em ${formatRangeLabel(range)}: venda direta no Hub, API e agentes, e o site white-label de cada estacionamento, com a origem/UTM das do Hub.`}
        actions={<ManagerFilterBar showCompare={false} />}
      />

      {/* KPIs por origem. "Pela API e agentes" era "via white-label" até 09/10/2026, mas conta reserva
          criada por chave de API (bots, parceiros); o white-label de verdade é o site do parceiro. */}
      <div className="grid gap-4 tablet:grid-cols-4">
        <Kpi
          label="Reservas no Hub (venda direta)"
          value={hubTotals.hub}
          sub={`${pct(hubTotals.hub, total)}% do total`}
          loading={isLoading}
          strong
        />
        <Kpi
          label="Pela API e agentes"
          value={hubTotals.external}
          sub={`${pct(hubTotals.external, total)}% do total`}
          loading={isLoading}
        />
        <Kpi
          label="No site white-label"
          value={site}
          sub={`${pct(site, total)}% do total`}
          loading={wlQ.isLoading}
        />
        <Kpi
          label="Total no período"
          value={total}
          sub="todas as reservas"
          loading={isLoading || wlQ.isLoading}
        />
      </div>

      {/* Por origem */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <h3 className="font-medium text-body text-ink">Por origem</h3>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (data?.by_origin ?? []).length === 0 ? (
            <EmptyState title="Sem reservas no período" description="Nada pra atribuir ainda." />
          ) : (
            <div className="overflow-hidden rounded-md border border-hairline bg-canvas">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Origem</TableHead>
                    <TableHead className="text-right">Reservas</TableHead>
                    <TableHead className="text-right">Confirmadas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.by_origin ?? []).map((r) => (
                    <TableRow key={r.origin}>
                      <TableCell className="text-ink">{r.origin}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted">
                        {r.confirmed}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Por utm_source */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <h3 className="font-medium text-body text-ink">Por fonte de marketing (utm_source)</h3>
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (data?.by_utm_source ?? []).length === 0 ? (
            <p className="text-body-sm text-muted">Sem reservas no período.</p>
          ) : (
            <div className="overflow-hidden rounded-md border border-hairline bg-canvas">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>utm_source</TableHead>
                    <TableHead className="text-right">Reservas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.by_utm_source ?? []).map((r) => (
                    <TableRow key={r.utm_source}>
                      <TableCell className="text-ink">{r.utm_source}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Saída para o parceiro (E0.16). Fecha a página: acima é o que ENTROU como reserva,
          aqui é o que SAIU e a gente não vê mais. */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div>
            <h3 className="font-medium text-body text-ink">Saída para unidade externa</h3>
            <p className="mt-1 text-body-sm text-muted">
              Cliques em &ldquo;Reservar no site do estacionamento&rdquo;. Nessas unidades a reserva
              fecha no parceiro, então o Hub não vê quantas viraram venda. Esse número só sai do
              relatório do estacionamento.
            </p>
          </div>

          <div className="grid gap-4 tablet:grid-cols-2">
            <Kpi
              label="Cliques de saída"
              value={exitTotals.clicks}
              sub={`em ${formatRangeLabel(range)}`}
              loading={exitClicks.isLoading}
              strong
            />
            <Kpi
              label="Sessões distintas"
              value={exitTotals.sessions}
              sub={
                exitTotals.sessions > 0
                  ? `${(exitTotals.clicks / exitTotals.sessions).toFixed(1)} cliques por sessão`
                  : "ninguém saiu no período"
              }
              loading={exitClicks.isLoading}
            />
          </div>

          {exitClicks.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (exitClicks.data ?? []).length === 0 ? (
            <EmptyState
              title="Nenhum clique de saída no período"
              description="Só unidades com checkout no parceiro aparecem aqui."
            />
          ) : (
            <div className="overflow-x-auto rounded-md border border-hairline bg-canvas">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estacionamento</TableHead>
                    <TableHead>Vaga</TableHead>
                    <TableHead className="text-right">Cliques</TableHead>
                    <TableHead className="text-right">Sessões</TableHead>
                    <TableHead className="text-right">Último clique</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(exitClicks.data ?? []).map((r) => (
                    <TableRow key={`${r.company_slug}-${r.location_slug}-${r.parking_type_code}`}>
                      <TableCell className="text-ink">{r.company_name}</TableCell>
                      <TableCell className="text-muted">{r.parking_type_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.clicks}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted">
                        {r.sessions}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted">
                        {formatDateTime(r.last_click_at)}
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
  );
}

function Kpi({
  label,
  value,
  sub,
  loading,
  strong,
}: {
  label: string;
  value: number;
  sub: string;
  loading?: boolean;
  strong?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="text-caption text-muted">{label}</div>
        {loading ? (
          <Skeleton className="mt-1 h-8 w-20" />
        ) : (
          <div className={strong ? "text-display-sm text-mp-primary" : "text-display-sm text-ink"}>
            {value}
          </div>
        )}
        <div className="mt-1 text-caption text-muted">{sub}</div>
      </CardContent>
    </Card>
  );
}
