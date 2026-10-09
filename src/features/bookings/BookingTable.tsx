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
import { Badge } from "@/components/ui/badge";
import { unifiedRowView } from "./unifiedBookingRow.logic";
import type { BookingWithRelations, UnifiedBookingRow, WlListRow } from "@/types/domain";

type Props = {
  /** Lista só do Hub (dashboard). As telas de Reservas mandam `rows`. */
  bookings?: BookingWithRelations[] | undefined;
  /** Lista única, Hub + white-label, na ordem do servidor (`useBookingsPage`). */
  rows?: UnifiedBookingRow[] | undefined;
  isLoading: boolean;
  onRowClick?: (booking: BookingWithRelations) => void;
  onWlRowClick?: (wl: WlListRow) => void;
  showCompany?: boolean;
  /** Etiqueta Hub / White-label. Só para quem tem white-label (reservas-unificadas-hub-wl.md § 2). */
  showSource?: boolean;
  /** Texto do estado vazio quando há filtro ligado (a tela sabe; a tabela não). */
  emptyDescription?: string;
  /** "parking": a coluna Valor mostra as diárias (visão do estacionamento, 08/10/2026). */
  valueMode?: "total" | "parking";
};

/**
 * A lista de reservas do Manager, do Operator e do dashboard (04/10/2026). Oito colunas em vez de
 * nove: empresa e unidade viram "Estacionamento", check-in, check-out e dias viram "Estadia", e
 * entram "Criada em" (com o canal da venda) e "Pagamento" (a forma e o estado do dinheiro).
 */
export function BookingTable({
  bookings,
  rows,
  isLoading,
  onRowClick,
  onWlRowClick,
  showCompany = true,
  showSource = false,
  emptyDescription,
  valueMode = "total",
}: Props) {
  const lista: UnifiedBookingRow[] | undefined =
    rows ?? bookings?.map((b) => ({ source: "hub" as const, id: b.id, booking: b }));

  if (isLoading) {
    return (
      <div className="space-y-2 rounded-md border border-hairline bg-canvas p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!lista || lista.length === 0) {
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
            <TableHead className="text-right">{valueMode === "parking" ? "Diárias" : "Valor"}</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lista.map((row) => {
            const v = unifiedRowView(row, { showSource, valueMode });
            const dias = v.checkIn && v.checkOut ? daysBetween(v.checkIn, v.checkOut) : null;
            const clicavel = row.source === "hub" ? !!onRowClick : !!onWlRowClick;
            return (
              <TableRow
                key={v.key}
                className={clicavel ? "cursor-pointer" : undefined}
                onClick={() => (row.source === "hub" ? onRowClick?.(row.booking) : onWlRowClick?.(row.wl))}
              >
                <TableCell className="whitespace-nowrap">
                  <div className="font-mono text-caption text-ink">{v.code}</div>
                  {v.sourceLabel && (
                    <Badge tone={v.source === "wl" ? "active" : "neutral"} className="mt-1">
                      {v.sourceLabel}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <div className="tabular-nums text-ink">{formatDateTime(v.createdAt)}</div>
                  {v.channel && <div className="text-caption text-muted">{v.channel}</div>}
                </TableCell>
                <TableCell className="text-ink">{v.customer ?? "-"}</TableCell>
                <TableCell>
                  {showCompany && <div className="text-ink">{v.companyName ?? "-"}</div>}
                  <div className={showCompany ? "text-caption text-muted" : "text-ink"}>{v.unitName ?? "-"}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  <div className="text-ink">{formatDateTime(v.checkIn)}</div>
                  <div className="text-caption text-muted">
                    até {formatDateTime(v.checkOut)}
                    {dias !== null && ` · ${dias} ${dias === 1 ? "dia" : "dias"}`}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <span className={v.payment.method ? "text-ink" : "text-muted"}>
                      {v.payment.method ?? "Sem pagamento"}
                    </span>
                    {v.payment.badge && (
                      <Badge tone={v.payment.badge.tone} className="whitespace-nowrap">
                        {v.payment.badge.label}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums text-ink">
                  {v.value === null ? "-" : formatBRL(v.value)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge status={v.status} />
                    {v.flightProtection && (
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
