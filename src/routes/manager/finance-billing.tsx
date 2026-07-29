import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { useCompanyFinance } from "@/features/finance/api";
import { formatBRL } from "@/lib/format";

export default function ManagerFinanceBilling() {
  const { range, scopedLocationIds } = useManagerFilters();
  const { data, isLoading } = useCompanyFinance(
    range.from.toISOString(),
    range.to.toISOString(),
    scopedLocationIds,
  );
  const totalGross = (data ?? []).reduce((acc, r) => acc + r.grossRevenue, 0);
  // Comissão real por empresa (take_rate_bps), não mais taxa fixa.
  const totalCommission = (data ?? []).reduce(
    (acc, r) => acc + (r.grossRevenue * r.takeRateBps) / 10000,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Faturamento"
        description={`Receita por empresa parceira em ${formatRangeLabel(range)}.`}
        actions={<ManagerFilterBar showCompare={false} />}
      />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-end gap-8 p-6">
          <div className="text-right">
            <div className="text-caption text-muted">Receita bruta</div>
            <div className="text-display-sm text-ink">{formatBRL(totalGross)}</div>
          </div>
          <div className="text-right">
            <div className="text-caption text-muted">Comissão Movepark</div>
            <div className="text-display-sm text-mp-primary">{formatBRL(totalCommission)}</div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState title="Sem movimentação" description="Nenhuma reserva no período escolhido." />
      ) : (
        <div className="overflow-hidden rounded-md border border-hairline bg-canvas">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">Reservas</TableHead>
                <TableHead className="text-right">Receita bruta</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
                <TableHead className="text-right">Repasse</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((row) => {
                const commission = (row.grossRevenue * row.takeRateBps) / 10000;
                return (
                  <TableRow key={row.companyId}>
                    <TableCell className="text-ink">{row.companyName}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.reservations}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBRL(row.grossRevenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBRL(commission)}
                      <span className="ml-1 text-caption text-muted">
                        ({row.takeRateBps / 100}%)
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBRL(row.grossRevenue - commission)}
                    </TableCell>
                    <TableCell>
                      <Badge tone="pending">Pendente</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
