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
import { useBookingAttribution } from "@/features/attribution/api";

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

export default function ManagerAttribution() {
  const { range, scopedLocationIds } = useManagerFilters();
  const { data, isLoading } = useBookingAttribution(
    range.from.toISOString(),
    range.to.toISOString(),
    scopedLocationIds,
  );
  const totals = data?.totals ?? { hub: 0, external: 0, total: 0 };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Atribuição"
        description={`De onde vieram as reservas criadas em ${formatRangeLabel(range)}: canal Hub (venda direta) x white-label, e a origem/UTM de cada uma.`}
        actions={<ManagerFilterBar showCompare={false} />}
      />

      {/* KPIs hub × white-label */}
      <div className="grid gap-4 tablet:grid-cols-3">
        <Kpi
          label="Reservas no Hub (venda direta)"
          value={totals.hub}
          sub={`${pct(totals.hub, totals.total)}% do total`}
          loading={isLoading}
          strong
        />
        <Kpi
          label="Reservas via white-label"
          value={totals.external}
          sub={`${pct(totals.external, totals.total)}% do total`}
          loading={isLoading}
        />
        <Kpi
          label="Total no período"
          value={totals.total}
          sub="todas as reservas"
          loading={isLoading}
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
