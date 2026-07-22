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
import { usePayoutStatement } from "@/features/payouts/api";
import { formatBRL } from "@/lib/format";

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

const brl = (cents: number) => formatBRL(cents / 100);

export default function ManagerFinancePayouts() {
  const months = React.useMemo(() => recentMonths(12), []);
  const [monthKey, setMonthKey] = React.useState(months[0].value);
  const period = months.find((m) => m.value === monthKey) ?? months[0];
  const { data, isLoading } = usePayoutStatement({ from: period.from, to: period.to });

  const companies = data?.companies ?? [];
  const totalNet = companies.reduce((acc, c) => acc + c.net_partner_cents, 0);
  const totalCommission = companies.reduce((acc, c) => acc + c.movepark_commission_cents, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Repasses"
        description="Extrato reconciliado do split: quanto cada parceiro recebe (real, do pagamento)."
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
              <div className="text-caption text-muted">Repasse líquido</div>
              <div className="text-display-sm text-ink">{brl(totalNet)}</div>
            </div>
            <div className="text-right">
              <div className="text-caption text-muted">Comissão Movepark</div>
              <div className="text-display-sm text-mp-primary">{brl(totalCommission)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : companies.length === 0 ? (
        <EmptyState title="Sem repasses" description="Nenhum pagamento confirmado no mês selecionado." />
      ) : (
        <div className="overflow-hidden rounded-md border border-hairline">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">Pagos</TableHead>
                <TableHead className="text-right">Bruto parceiro</TableHead>
                <TableHead className="text-right">Estornos</TableHead>
                <TableHead className="text-right">Líquido a repassar</TableHead>
                <TableHead className="text-right">Comissão Movepark</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => (
                <TableRow key={c.company_id}>
                  <TableCell className="text-ink">{c.company_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.paid_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{brl(c.gross_partner_cents)}</TableCell>
                  <TableCell className="text-right tabular-nums text-warning">
                    {c.refunded_partner_cents > 0 ? `−${brl(c.refunded_partner_cents)}` : "-"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-ink">
                    {brl(c.net_partner_cents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-mp-primary">
                    {brl(c.movepark_commission_cents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
