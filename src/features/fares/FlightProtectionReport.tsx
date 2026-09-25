import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/lib/format";
import { useFlightProtectionMonthly } from "./api";
import { monthLabel, summarizeFlightMonths } from "./flightReport.logic";

/** Proteção de voo por mês (hub_admin): acionamentos, crédito pago ao parceiro e excedente do balcão. */
export function FlightProtectionReport() {
  const { data, isLoading } = useFlightProtectionMonthly();
  const rows = summarizeFlightMonths(data);
  const brl = (c: number) => formatBRL(c / 100);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Proteção de voo por mês</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState title="Nenhum acionamento ainda" description="Quando um cliente Superflex acionar a proteção de voo, o custo aparece aqui." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Acionamentos</TableHead>
                <TableHead className="text-right">Atraso</TableHead>
                <TableHead className="text-right">Cancelamento</TableHead>
                <TableHead className="text-right">Crédito ao parceiro (24h)</TableHead>
                <TableHead className="text-right">Excedente previsto</TableHead>
                <TableHead className="text-right">Cobrado no balcão</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.month}>
                  <TableCell className="text-ink">{monthLabel(r.month)}</TableCell>
                  <TableCell className="text-right">{r.claims}</TableCell>
                  <TableCell className="text-right">{r.delay}</TableCell>
                  <TableCell className="text-right">{r.cancellation}</TableCell>
                  <TableCell className="text-right">{brl(r.creditCents)}</TableCell>
                  <TableCell className="text-right">{brl(r.overageCents)}</TableCell>
                  <TableCell className="text-right">{brl(r.chargedCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
