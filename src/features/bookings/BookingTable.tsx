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
import type { BookingWithRelations } from "@/types/domain";

type Props = {
  bookings: BookingWithRelations[] | undefined;
  isLoading: boolean;
  onRowClick?: (booking: BookingWithRelations) => void;
  showCompany?: boolean;
};

export function BookingTable({ bookings, isLoading, onRowClick, showCompany = true }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!bookings || bookings.length === 0) {
    return (
      <EmptyState
        title="Nenhuma reserva encontrada"
        description="Ajuste os filtros para ver resultados."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-hairline">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#ID</TableHead>
            <TableHead>Cliente</TableHead>
            {showCompany && <TableHead>Empresa</TableHead>}
            <TableHead>Localização</TableHead>
            <TableHead>Check-in</TableHead>
            <TableHead>Check-out</TableHead>
            <TableHead className="text-right">Dias</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((b) => (
            <TableRow
              key={b.id}
              className={onRowClick ? "cursor-pointer" : undefined}
              onClick={() => onRowClick?.(b)}
            >
              <TableCell className="font-mono text-caption">{b.code}</TableCell>
              <TableCell className="text-ink">{bookingCustomerName(b) ?? "-"}</TableCell>
              {showCompany && <TableCell>{b.location?.company?.name ?? "—"}</TableCell>}
              <TableCell>{b.location?.name ?? "—"}</TableCell>
              <TableCell>{formatDateTime(b.check_in_at)}</TableCell>
              <TableCell>{formatDateTime(b.check_out_at)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {daysBetween(b.check_in_at, b.check_out_at)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatBRL(b.total_amount)}</TableCell>
              <TableCell>
                <StatusBadge status={b.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
