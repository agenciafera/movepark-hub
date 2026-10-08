import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBRL, formatDateTime } from "@/lib/format";
import { useWlBookings } from "./api";
import {
  attendanceLabel,
  centsToReais,
  WL_BOOKING_STATUS_OPTIONS,
  wlBookingStatusLabel,
  wlBookingStatusTone,
} from "./wlBooking.logic";
import type { WlBookingRow, WlBookingStatus } from "@/types/domain";

/**
 * Aba "Pelo seu site" em Reservas: o que o site white-label do parceiro vendeu, trazido para o
 * Hub. Só leitura nesta fase: a reserva é operada no painel do site, e o dinheiro não passa pelo
 * Hub, por isso nada aqui soma com o repasse.
 *
 * Spec: docs/specs/reservas-wl-no-hub.md § 9.
 */
export function WlBookingsPanel({ companyId }: { companyId?: string }) {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<WlBookingStatus | "all">("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [aberta, setAberta] = React.useState<WlBookingRow | null>(null);

  const { data, isLoading, error } = useWlBookings({
    companyId,
    status: status === "all" ? undefined : status,
    search: search || undefined,
    from: from ? `${from}T00:00:00` : undefined,
    to: to ? `${to}T23:59:59` : undefined,
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-muted">
        Reservas feitas no seu site. Para alterar ou cancelar, use o painel do seu site. O valor
        delas não entra no seu repasse da Movepark.
      </p>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6 tablet:flex-row tablet:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="wl-search">Busca</Label>
            <Input
              id="wl-search"
              placeholder="Número do pedido ou placa"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wl-from">Entrada de</Label>
            <Input id="wl-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wl-to">até</Label>
            <Input id="wl-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <div className="flex w-full flex-col gap-1.5 tablet:w-60">
            <Label htmlFor="wl-status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as WlBookingStatus | "all")}>
              <SelectTrigger id="wl-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WL_BOOKING_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <div className="rounded-md border border-error bg-badge-cancelled-bg p-4 text-body-sm text-error">
          Não deu para carregar as reservas do seu site:{" "}
          {error instanceof Error ? error.message : "erro desconhecido"}
        </div>
      ) : (data ?? []).length === 0 ? (
        <EmptyState title="Nenhuma reserva encontrada" description="Mude os filtros para ver outras datas." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Saída</TableHead>
                <TableHead>Vaga</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((b) => (
                <TableRow key={b.id} className="cursor-pointer" onClick={() => setAberta(b)}>
                  <TableCell>
                    <div className="font-medium">{b.wl_order_number}</div>
                    <div className="text-sm text-muted-foreground">{b.license_plate ?? "-"}</div>
                  </TableCell>
                  <TableCell>{b.customer_name ?? "-"}</TableCell>
                  <TableCell>{formatDateTime(b.check_in_at)}</TableCell>
                  <TableCell>{formatDateTime(b.check_out_at)}</TableCell>
                  <TableCell>
                    <div>{b.parking_type_name ?? b.product_slug ?? "-"}</div>
                    <div className="text-sm text-muted-foreground">{b.location_name ?? b.category_slug ?? ""}</div>
                  </TableCell>
                  <TableCell>
                    <Badge tone={wlBookingStatusTone(b.status)}>{wlBookingStatusLabel(b.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatBRL(centsToReais(b.paid_total_cents ?? b.total_cents))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DetalheWlBooking booking={aberta} onClose={() => setAberta(null)} />
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-hairline py-2 text-body-sm last:border-0">
      <span className="text-muted">{rotulo}</span>
      <span className="text-right text-ink">{valor}</span>
    </div>
  );
}

function DetalheWlBooking({ booking, onClose }: { booking: WlBookingRow | null; onClose: () => void }) {
  return (
    <Dialog open={!!booking} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {booking ? (
          <>
            <DialogHeader>
              <DialogTitle>Pedido {booking.wl_order_number}</DialogTitle>
              <DialogDescription>
                Reserva feita no seu site. Para alterar, use o painel do seu site.
              </DialogDescription>
            </DialogHeader>
            <div>
              <Linha
                rotulo="Status"
                valor={<Badge tone={wlBookingStatusTone(booking.status)}>{wlBookingStatusLabel(booking.status)}</Badge>}
              />
              <Linha rotulo="Cliente" valor={booking.customer_name ?? "-"} />
              <Linha rotulo="Telefone" valor={booking.customer_phone ?? "-"} />
              <Linha rotulo="E-mail" valor={booking.customer_email ?? "-"} />
              <Linha rotulo="Placa" valor={booking.license_plate ?? "-"} />
              <Linha rotulo="Entrada" valor={formatDateTime(booking.check_in_at)} />
              <Linha rotulo="Saída" valor={formatDateTime(booking.check_out_at)} />
              <Linha
                rotulo="Vaga"
                valor={`${booking.parking_type_name ?? booking.product_slug ?? "-"}${booking.location_name ? ` · ${booking.location_name}` : ""}`}
              />
              <Linha rotulo="Passageiros" valor={booking.passenger_count ?? "-"} />
              <Linha rotulo="PCD" valor={booking.has_pcd ? "Sim" : "Não"} />
              <Linha rotulo="Comparecimento" valor={attendanceLabel(booking.attendance_status)} />
              <Linha rotulo="Valor pago no site" valor={formatBRL(centsToReais(booking.paid_total_cents ?? booking.total_cents))} />
              <Linha rotulo="Comprada em" valor={formatDateTime(booking.wl_created_at)} />
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
