import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { useCompanyFinance } from "@/features/finance/api";
import { formatBRL } from "@/lib/format";

const COMMISSION_RATE = 0.1;

function recentMonths(n: number) {
  const out: { value: string; label: string; date: Date }[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      value: d.toISOString().slice(0, 7),
      label: format(d, "MMMM yyyy", { locale: ptBR }),
      date: d,
    });
  }
  return out;
}

export default function ManagerFinanceBilling() {
  const months = React.useMemo(() => recentMonths(12), []);
  const [monthKey, setMonthKey] = React.useState(months[0].value);
  const selectedMonth = months.find((m) => m.value === monthKey)?.date ?? new Date();
  const { data, isLoading } = useCompanyFinance(selectedMonth);
  const totalGross = (data ?? []).reduce((acc, r) => acc + r.grossRevenue, 0);
  const totalCommission = totalGross * COMMISSION_RATE;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Faturamento"
        description="Receita consolidada por empresa parceira."
      />

      <Card>
        <CardContent className="flex flex-col gap-4 p-6 tablet:flex-row tablet:items-end">
          <div className="flex w-full tablet:w-60 flex-col gap-1.5">
            <label className="text-caption text-muted">Mês de referência</label>
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
          <div className="grid grid-cols-2 gap-6 tablet:ml-auto">
            <div className="text-right">
              <div className="text-caption text-muted">Receita bruta</div>
              <div className="text-display-sm text-ink">{formatBRL(totalGross)}</div>
            </div>
            <div className="text-right">
              <div className="text-caption text-muted">Comissão Movepark</div>
              <div className="text-display-sm text-mp-primary">{formatBRL(totalCommission)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState title="Sem movimentação" description="Nenhuma reserva no mês selecionado." />
      ) : (
        <div className="overflow-hidden rounded-md border border-hairline">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">Reservas</TableHead>
                <TableHead className="text-right">Receita bruta</TableHead>
                <TableHead className="text-right">Comissão (10%)</TableHead>
                <TableHead className="text-right">Repasse</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((row) => {
                const commission = row.grossRevenue * COMMISSION_RATE;
                return (
                  <TableRow key={row.companyId}>
                    <TableCell className="text-ink">{row.companyName}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.reservations}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBRL(row.grossRevenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBRL(commission)}
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
