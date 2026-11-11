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
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { FilePdf } from "@phosphor-icons/react";
import { toast } from "sonner";
import * as React from "react";
import { unifiedRowView, type UnifiedRowView } from "./unifiedBookingRow.logic";
import {
  columnHeader,
  defaultColumnSettings,
  visibleColumnIds,
  type BookingColumnId,
} from "./bookingColumns.logic";
import { canDownloadVoucher } from "./voucher.logic";
import { useVoucherPdf } from "./customerApi";
import { fetchWlVoucherUrl } from "@/features/wl-bookings/api";
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
  /**
   * Seleção para ação em massa (fase 6). A chave é `hub:<id>` ou `wl:<id>`, a mesma de
   * `unifiedRowView`. Sem `onSelectedChange` a coluna de seleção não aparece.
   */
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  /**
   * Colunas na ordem em que aparecem (a escolha da pessoa, `bookingColumns.logic.ts`). Sem isso,
   * as colunas padrão.
   */
  columns?: BookingColumnId[];
};

const DEFAULT_COLUMNS = visibleColumnIds(defaultColumnSettings());

type VoucherOpener = {
  open: (key: string, getUrl: () => Promise<string | null>) => void;
  pendingKey: string | null;
};

/**
 * Abre o PDF do voucher numa aba nova. A aba abre no clique, antes de o PDF ficar pronto, porque
 * navegador bloqueia `window.open` que vem depois de uma espera (popup sem gesto do usuário).
 */
function useVoucherOpener(): VoucherOpener {
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  const open = React.useCallback(async (key: string, getUrl: () => Promise<string | null>) => {
    const tab = window.open("", "_blank");
    setPendingKey(key);
    try {
      const url = await getUrl();
      if (!url) {
        tab?.close();
        toast.error("O site ainda não mandou o voucher desta reserva.");
        return;
      }
      if (tab) tab.location.href = url;
      else window.open(url, "_blank");
    } catch (err) {
      tab?.close();
      toast.error(err instanceof Error ? err.message : "Falha ao gerar o voucher");
    } finally {
      setPendingKey(null);
    }
  }, []);
  return { open, pendingKey };
}

function BookingCell({
  id,
  row,
  v,
  dias,
  showCompany,
  voucher,
}: {
  id: BookingColumnId;
  row: UnifiedBookingRow;
  v: UnifiedRowView;
  dias: number | null;
  showCompany: boolean;
  voucher: VoucherOpener;
}) {
  switch (id) {
    case "code":
      return (
        <TableCell className="whitespace-nowrap">
          <div className="font-mono text-caption text-ink">{v.code}</div>
          {v.sourceLabel && (
            <Badge tone={v.source === "wl" ? "active" : "neutral"} className="mt-1">
              {v.sourceLabel}
            </Badge>
          )}
        </TableCell>
      );
    case "created":
      return (
        <TableCell className="whitespace-nowrap">
          <div className="tabular-nums text-ink">{formatDateTime(v.createdAt)}</div>
          {v.channel && <div className="text-caption text-muted">{v.channel}</div>}
        </TableCell>
      );
    case "customer":
      return <TableCell className="text-ink">{v.customer ?? "-"}</TableCell>;
    case "parking":
      return (
        <TableCell>
          {showCompany && <div className="text-ink">{v.companyName ?? "-"}</div>}
          <div className={showCompany ? "text-caption text-muted" : "text-ink"}>
            {v.unitName ?? "-"}
          </div>
        </TableCell>
      );
    case "stay":
      return (
        <TableCell className="whitespace-nowrap tabular-nums">
          <div className="text-ink">{formatDateTime(v.checkIn)}</div>
          <div className="text-caption text-muted">
            até {formatDateTime(v.checkOut)}
            {dias !== null && ` · ${dias} ${dias === 1 ? "dia" : "dias"}`}
          </div>
        </TableCell>
      );
    case "payment":
      return (
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
      );
    case "value":
      return (
        <TableCell className="whitespace-nowrap text-right tabular-nums text-ink">
          {v.value === null ? "-" : formatBRL(v.value)}
        </TableCell>
      );
    case "status":
      return (
        <TableCell>
          <div className="flex flex-col items-start gap-1">
            <StatusBadge status={v.status} />
            {v.flightProtection && (
              <Badge
                tone="pending"
                title="Proteção de voo acionada: confira até quando sai sem custo"
              >
                Proteção de voo
              </Badge>
            )}
          </div>
        </TableCell>
      );
    case "voucher":
      return (
        <TableCell className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <VoucherCell row={row} voucher={voucher} />
        </TableCell>
      );
    case "plate":
      return (
        <TableCell className="whitespace-nowrap font-mono text-caption text-ink">
          {v.plate ?? "-"}
        </TableCell>
      );
    case "phone":
      return (
        <TableCell className="whitespace-nowrap tabular-nums text-ink">{v.phone ?? "-"}</TableCell>
      );
    case "email":
      return <TableCell className="text-ink">{v.email ?? "-"}</TableCell>;
  }
}

/** Reserva do site com voucher: as que viraram venda e não foram canceladas. */
const WL_VOUCHER_STATUSES = new Set<string>(["confirmed", "checked_in", "completed"]);

/**
 * Voucher direto da lista (11/11/2026): o balcão abria a reserva só para baixar o PDF. A do Hub
 * gera na hora pela Edge `voucher-pdf`, nos mesmos status em que o detalhe oferece; a do site usa
 * o PDF que o próprio site emitiu, buscado no clique.
 */
function VoucherCell({ row, voucher }: { row: UnifiedBookingRow; voucher: VoucherOpener }) {
  const pdf = useVoucherPdf();
  const ok =
    row.source === "wl"
      ? WL_VOUCHER_STATUSES.has(row.wl.status)
      : canDownloadVoucher(row.booking.status);
  if (!ok) return <span className="text-muted">-</span>;
  const code = row.source === "wl" ? row.wl.wl_order_number : row.booking.code;
  const key = `${row.source}:${row.id}`;
  const getUrl =
    row.source === "wl"
      ? () => fetchWlVoucherUrl(row.wl.id)
      : async () => (await pdf.mutateAsync(row.booking.code)).url;
  const gerando = voucher.pendingKey === key;
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={gerando}
      onClick={() => voucher.open(key, getUrl)}
      aria-label={`Abrir voucher ${code}`}
    >
      <FilePdf aria-hidden />
      {gerando ? "Gerando..." : "Abrir"}
    </Button>
  );
}

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
  selected,
  onSelectedChange,
  columns,
}: Props) {
  const selecionavel = !!onSelectedChange;
  const cols = columns ?? DEFAULT_COLUMNS;
  const voucher = useVoucherOpener();
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
            {selecionavel && (
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Selecionar todas desta página"
                  checked={
                    lista.length > 0 && lista.every((r) => selected?.has(`${r.source}:${r.id}`))
                      ? true
                      : lista.some((r) => selected?.has(`${r.source}:${r.id}`))
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={(v) => {
                    const next = new Set(selected);
                    for (const r of lista) {
                      if (v === true) next.add(`${r.source}:${r.id}`);
                      else next.delete(`${r.source}:${r.id}`);
                    }
                    onSelectedChange?.(next);
                  }}
                />
              </TableHead>
            )}
            {cols.map((id) => (
              <TableHead key={id} className={id === "value" ? "text-right" : undefined}>
                {columnHeader(id, { showCompany, valueMode })}
              </TableHead>
            ))}
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
                onClick={() =>
                  row.source === "hub" ? onRowClick?.(row.booking) : onWlRowClick?.(row.wl)
                }
              >
                {selecionavel && (
                  <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      aria-label={`Selecionar ${v.code}`}
                      checked={selected?.has(v.key) ?? false}
                      onCheckedChange={(c) => {
                        const next = new Set(selected);
                        if (c === true) next.add(v.key);
                        else next.delete(v.key);
                        onSelectedChange?.(next);
                      }}
                    />
                  </TableCell>
                )}
                {cols.map((id) => (
                  <BookingCell
                    key={id}
                    id={id}
                    row={row}
                    v={v}
                    dias={dias}
                    showCompany={showCompany}
                    voucher={voucher}
                  />
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
