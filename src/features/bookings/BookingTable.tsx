import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatBRL, formatDateTime, daysBetween } from "@/lib/format";
import { bookingCustomerName } from "./bookings.logic";
import { paymentBadge } from "./payment.logic";
import { channelShortLabel, paymentMethodLabel } from "./bookingList.logic";
import { Badge } from "@/components/ui/badge";
import type { BookingWithRelations } from "@/types/domain";

type Props = {
  bookings: BookingWithRelations[] | undefined;
  isLoading: boolean;
  onRowClick?: (booking: BookingWithRelations) => void;
  showCompany?: boolean;
  /** Texto do estado vazio quando há filtro ligado (a tela sabe; a tabela não). */
  emptyDescription?: string;
};

/**
 * A lista de reservas do Manager, do Operator e do dashboard (04/10/2026). Oito colunas em vez de
 * nove: empresa e unidade viram "Estacionamento", check-in, check-out e dias viram "Estadia", e
 * entram "Criada em" (com o canal da venda) e "Pagamento" (a forma e o estado do dinheiro).
 */
export function BookingTable({ bookings, isLoading, onRowClick, showCompany = true, emptyDescription }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2 rounded-md border border-hairline bg-canvas p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!bookings || bookings.length === 0) {
    return (
      <div className="rounded-md border border-hairline bg-canvas">
        <EmptyState
          title="Nenhuma reserva encontrada"
          description={emptyDescription ?? "Ajuste os filtros para ver resultados."}
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-hairline bg-canvas">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reserva</TableHead>
            <TableHead>Criada em</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>{showCompany ? "Estacionamento" : "Unidade"}</TableHead>
            <TableHead>Estadia</TableHead>
            <TableHead>Pagamento</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((b) => {
            const canal = channelShortLabel(b.origin);
            const metodo = paymentMethodLabel(b.payments);
            const dinheiro = paymentBadge(b.payments, b.status);
            const dias = daysBetween(b.check_in_at, b.check_out_at);
            return (
              <TableRow
                key={b.id}
                className={onRowClick ? "cursor-pointer" : undefined}
                onClick={() => onRowClick?.(b)}
              >
                <TableCell className="whitespace-nowrap font-mono text-caption text-ink">{b.code}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <div className="tabular-nums text-ink">{formatDateTime(b.created_at)}</div>
                  {canal && <div className="text-caption text-muted">{canal}</div>}
                </TableCell>
                <TableCell className="text-ink">{bookingCustomerName(b) ?? "-"}</TableCell>
                <TableCell>
                  {showCompany && <div className="text-ink">{b.location?.company?.name ?? "-"}</div>}
                  <div className={showCompany ? "text-caption text-muted" : "text-ink"}>{b.location?.name ?? "-"}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  <div className="text-ink">{formatDateTime(b.check_in_at)}</div>
                  <div className="text-caption text-muted">
                    até {formatDateTime(b.check_out_at)} · {dias} {dias === 1 ? "dia" : "dias"}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <span className={metodo ? "text-ink" : "text-muted"}>{metodo ?? "Sem pagamento"}</span>
                    {dinheiro && (
                      <Badge tone={dinheiro.tone} className="whitespace-nowrap">
                        {dinheiro.label}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums text-ink">{formatBRL(b.total_amount)}</TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={b.status} />
                    {b.fare_extensions?.[0] && !b.fare_extensions[0].actual_check_out_at && (
                      <Badge tone="pending" title="Proteção de voo acionada: confira até quando sai sem custo">
                        Proteção de voo
                      </Badge>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
