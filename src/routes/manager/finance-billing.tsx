import { Link } from "react-router-dom";
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
import { useWlRevenue } from "@/features/finance/wlRevenue";
import { billingRows, billingTotals } from "@/features/finance/billingByOrigin.logic";
import { formatBRL } from "@/lib/format";

function Numero({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="text-right">
      <div className="text-caption text-muted">{label}</div>
      <div className={`text-display-sm ${accent ? "text-mp-primary" : "text-ink"}`}>{value}</div>
      {hint && <div className="text-caption text-muted">{hint}</div>}
    </div>
  );
}

/**
 * Faturamento da rede (fase 5 das reservas unificadas, 09/10/2026): o Hub e o site white-label lado
 * a lado por empresa, com o total e a quebra por origem (D4). Comissão só do Hub, pela
 * `take_rate_bps`: a venda do site não tem comissão no Hub (D4b revista em 09/10/2026).
 */
export default function ManagerFinanceBilling() {
  const { range, scopedLocationIds } = useManagerFilters();
  const from = range.from.toISOString();
  const to = range.to.toISOString();
  const hubQ = useCompanyFinance(from, to, scopedLocationIds);
  const wlQ = useWlRevenue({ from, to, locationIds: scopedLocationIds });
  const isLoading = hubQ.isLoading || wlQ.isLoading;
  const rows = billingRows(hubQ.data ?? [], wlQ.data?.by_company ?? []);
  const t = billingTotals(rows);
  const temSite = t.wlGross > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Faturamento"
        description={`Receita por empresa parceira em ${formatRangeLabel(range)}.`}
        actions={<ManagerFilterBar showCompare={false} />}
      />

      <Card>
        <CardContent
          className="flex flex-wrap items-start justify-end gap-8 p-6"
          data-testid="faturamento-totais"
        >
          <Numero
            label="Receita bruta"
            value={formatBRL(t.gross)}
            hint={
              temSite
                ? `${formatBRL(t.hubGross)} no Hub, ${formatBRL(t.wlGross)} no white-label`
                : undefined
            }
          />
          <Numero
            label="Comissão Movepark"
            value={formatBRL(t.commission)}
            accent
            hint={temSite ? "só da venda pelo Hub" : undefined}
          />
        </CardContent>
      </Card>


      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState title="Sem movimentação" description="Nenhuma reserva no período escolhido." />
      ) : (
        <div className="overflow-hidden rounded-md border border-hairline bg-canvas">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">Reservas</TableHead>
                <TableHead className="text-right">Receita Hub</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
                <TableHead className="text-right">Repasse</TableHead>
                {temSite && <TableHead className="text-right">White-label</TableHead>}
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                return (
                  <TableRow key={row.companyId}>
                    <TableCell className="text-ink">
                      {/* Nome leva à conta do estacionamento (E0.3.7): extrato, saque, estorno. */}
                      <Link
                        to={`/manager/companies/${row.companyId}/conta`}
                        className="underline-offset-2 hover:underline"
                      >
                        {row.companyName}
                      </Link>
                    </TableCell>
                    {/* Empresa que só vendeu no site: as colunas do Hub ficam em traço, não em
                        "R$ 0,00 (0%)", que parecia uma comissão zerada. */}
                    <TableCell className="text-right tabular-nums">
                      {row.hubReservations || "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.hubReservations ? formatBRL(row.hubGross) : "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.hubReservations ? (
                        <>
                          {formatBRL(row.hubCommission)}
                          <span className="ml-1 text-caption text-muted">
                            ({row.hubTakeRateBps / 100}%)
                          </span>
                        </>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.hubReservations ? formatBRL(row.hubPayout) : "-"}
                    </TableCell>
                    {temSite && (
                      <TableCell className="text-right tabular-nums">
                        {row.wlPaidAmount > 0 ? formatBRL(row.wlPaidAmount) : "-"}
                        {row.wlPaid > 0 && (
                          <span className="ml-1 text-caption text-muted">({row.wlPaid})</span>
                        )}
                      </TableCell>
                    )}
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
