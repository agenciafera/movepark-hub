import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL, formatDate } from "@/lib/format";
import { usePayoutDebtLines } from "./api";

const brl = (cents: number) => formatBRL(cents / 100);

/**
 * O que o parceiro vê da própria dívida (E0.3.5, decisão 11: transparência total). Cada origem é
 * um cancelamento que a Movepark devolveu ao cliente depois de o gateway já ter pago o parceiro;
 * cada abatimento é uma reserva nova que descontou. Sem isto, a reserva "vem zerada" e vira ticket.
 */
export function PartnerDebtCard({ companyId }: { companyId: string }) {
  const { data, isLoading } = usePayoutDebtLines(companyId);
  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!data) return null;

  const temHistorico = data.origins.length > 0 || data.recoveries.length > 0 || data.settlements.length > 0;
  if (data.debt_cents === 0 && !temHistorico) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Acerto com a Movepark</CardTitle>
        <p className="text-body-sm text-muted">
          {data.debt_cents > 0
            ? `Você tem ${brl(data.debt_cents)} a acertar. As próximas reservas abatem sozinhas, até quitar.`
            : "Tudo acertado. O histórico fica aqui para conferência."}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {data.origins.length > 0 && (
          <div>
            <div className="mb-2 text-caption text-muted">De onde veio</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reserva</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.origins.map((o) => (
                  <TableRow key={`${o.booking_code}-${o.at}`}>
                    <TableCell className="text-ink">{o.booking_code}</TableCell>
                    <TableCell className="text-muted">{o.at ? formatDate(o.at) : "-"}</TableCell>
                    <TableCell className="text-muted">{o.reason ?? "estorno"}</TableCell>
                    <TableCell className="text-right tabular-nums text-warning">+{brl(o.cents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {data.recoveries.length > 0 && (
          <div>
            <div className="mb-2 text-caption text-muted">O que já abateu</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reserva</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead className="text-right">Abatido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recoveries.map((r) => (
                  <TableRow key={`${r.booking_code}-${r.at}`}>
                    <TableCell className="text-ink">{r.booking_code}</TableCell>
                    <TableCell className="text-muted">{r.at ? formatDate(r.at) : "-"}</TableCell>
                    <TableCell className="text-right tabular-nums text-ink">−{brl(r.cents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {data.settlements.length > 0 && (
          <div>
            <div className="mb-2 text-caption text-muted">Acertos por fora</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Observação</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.settlements.map((s) => (
                  <TableRow key={s.at}>
                    <TableCell className="text-muted">{formatDate(s.at)}</TableCell>
                    <TableCell className="text-muted">{s.note ?? (s.kind === "adjustment" ? "ajuste" : "pagamento")}</TableCell>
                    <TableCell className="text-right tabular-nums text-ink">−{brl(s.cents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
