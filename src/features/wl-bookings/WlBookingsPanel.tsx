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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatBRL, formatDateTime } from "@/lib/format";
import { useWlBookingAction, useWlBookingActions, useWlBookings } from "./api";
import {
  attendanceLabel,
  canMarkArrived,
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

      <DetalheWlBooking
        booking={aberta}
        onClose={() => setAberta(null)}
        onChanged={(patch) => setAberta((b) => (b ? { ...b, ...patch } : b))}
      />
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

function DetalheWlBooking({
  booking,
  onClose,
  onChanged,
}: {
  booking: WlBookingRow | null;
  onClose: () => void;
  onChanged: (patch: Partial<WlBookingRow>) => void;
}) {
  return (
    <Dialog open={!!booking} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {booking ? (
          <>
            <DialogHeader>
              <DialogTitle>Pedido {booking.wl_order_number}</DialogTitle>
              <DialogDescription>
                Reserva feita no seu site. Para cancelar ou mudar a data, use o painel do seu site.
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
            <AcoesWlBooking booking={booking} onChanged={onChanged} />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Check-in, no-show e troca de placa, gravados no site do parceiro pela Edge `wl-booking-action`.
 * Só aparece com a chave de ações ligada e com permissão (check-in: bookings:checkin; placa:
 * bookings:write). A regra de verdade é do site e do servidor; aqui só não se oferece o que vai
 * ser recusado.
 */
function AcoesWlBooking({
  booking,
  onChanged,
}: {
  booking: WlBookingRow;
  onChanged: (patch: Partial<WlBookingRow>) => void;
}) {
  const perms = useWlBookingActions(booking.company_id);
  const acao = useWlBookingAction();
  const [trocandoPlaca, setTrocandoPlaca] = React.useState(false);
  const [placa, setPlaca] = React.useState("");
  const [motivo, setMotivo] = React.useState("");

  const p = perms.data;
  if (!p?.enabled || booking.status !== "confirmed" || (!p.attendance && !p.license_plate)) return null;

  const marcar = (status: "compareceu" | "no_show" | "pendente") =>
    acao.mutate(
      { action: "attendance", wlBookingId: booking.id, status },
      {
        onSuccess: () => {
          onChanged({ attendance_status: status });
          toast.success(status === "compareceu" ? "Chegada registrada no seu site." : "Registrado no seu site.");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Não deu para registrar."),
      },
    );

  const trocarPlaca = () =>
    acao.mutate(
      { action: "license_plate", wlBookingId: booking.id, licensePlate: placa.trim(), reason: motivo.trim() },
      {
        onSuccess: (data) => {
          onChanged({ license_plate: String(data.license_plate ?? placa.trim().toUpperCase()) });
          setTrocandoPlaca(false);
          setPlaca("");
          setMotivo("");
          toast.success("Placa trocada no seu site.");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Não deu para trocar a placa."),
      },
    );

  const chegou = booking.attendance_status === "compareceu";
  const naoVeio = booking.attendance_status === "no_show";
  const podeChegar = canMarkArrived(booking.check_in_at);

  return (
    <div className="flex flex-col gap-3 border-t border-hairline pt-4">
      {p.attendance ? (
        <div className="flex flex-wrap gap-2">
          {!chegou ? (
            <Button
              size="sm"
              onClick={() => marcar("compareceu")}
              disabled={acao.isPending || !podeChegar}
              title={podeChegar ? undefined : "Libera no horário de entrada."}
            >
              Cliente chegou
            </Button>
          ) : null}
          {!naoVeio ? (
            <Button size="sm" variant="secondary" onClick={() => marcar("no_show")} disabled={acao.isPending}>
              Não veio
            </Button>
          ) : null}
          {chegou || naoVeio ? (
            <Button size="sm" variant="ghost" onClick={() => marcar("pendente")} disabled={acao.isPending}>
              Desfazer marcação
            </Button>
          ) : null}
        </div>
      ) : null}

      {p.license_plate ? (
        trocandoPlaca ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="wl-nova-placa">Nova placa</Label>
            <Input id="wl-nova-placa" value={placa} onChange={(e) => setPlaca(e.target.value)} placeholder="ABC1D23" />
            <Label htmlFor="wl-motivo">Motivo</Label>
            <Textarea id="wl-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} />
            <div className="flex gap-2">
              <Button size="sm" onClick={trocarPlaca} disabled={acao.isPending || !placa.trim() || !motivo.trim()}>
                {acao.isPending ? "Salvando..." : "Salvar placa"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setTrocandoPlaca(false)} disabled={acao.isPending}>
                Voltar
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button size="sm" variant="secondary" onClick={() => setTrocandoPlaca(true)}>
              Trocar placa
            </Button>
          </div>
        )
      ) : null}
    </div>
  );
}
