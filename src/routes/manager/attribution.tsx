import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { useBookingAttribution } from "@/features/attribution/api";

function recentMonths(n: number) {
  const out: { value: string; label: string; from: string; to: string }[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const start = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
    const end = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i + 1, 1));
    out.push({
      value: start.toISOString().slice(0, 7),
      label: format(start, "MMMM yyyy", { locale: ptBR }),
      from: start.toISOString(),
      to: end.toISOString(),
    });
  }
  return out;
}

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

export default function ManagerAttribution() {
  const months = React.useMemo(() => recentMonths(12), []);
  const [monthKey, setMonthKey] = React.useState(months[0].value);
  const period = months.find((m) => m.value === monthKey) ?? months[0];

  const { data, isLoading } = useBookingAttribution(period.from, period.to);
  const totals = data?.totals ?? { hub: 0, external: 0, total: 0 };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Atribuição"
        description="De onde vêm as reservas: canal Hub (venda direta) × white-label, e a origem/UTM de cada uma."
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-caption text-muted">Período</span>
            <div className="w-48">
              <Select value={monthKey} onValueChange={setMonthKey}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

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
        <Kpi label="Total no período" value={totals.total} sub="todas as reservas" loading={isLoading} />
      </div>

      {/* Por origem */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <h3 className="text-body font-medium text-ink">Por origem</h3>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (data?.by_origin ?? []).length === 0 ? (
            <EmptyState title="Sem reservas no período" description="Nada pra atribuir ainda." />
          ) : (
            <div className="overflow-hidden rounded-md border border-hairline">
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
                      <TableCell className="text-right tabular-nums text-muted">{r.confirmed}</TableCell>
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
          <h3 className="text-body font-medium text-ink">Por fonte de marketing (utm_source)</h3>
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (data?.by_utm_source ?? []).length === 0 ? (
            <p className="text-body-sm text-muted">Sem reservas no período.</p>
          ) : (
            <div className="overflow-hidden rounded-md border border-hairline">
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
