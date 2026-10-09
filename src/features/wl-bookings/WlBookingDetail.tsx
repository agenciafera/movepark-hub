import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { useWlBookingAction, useWlBookingActions } from "./api";
import {
  attendanceLabel,
  canMarkArrived,
  centsToReais,
  wlBookingStatusLabel,
  wlBookingStatusTone,
} from "./wlBooking.logic";
import type { WlBookingRow } from "@/types/domain";

/**
 * Detalhe de uma reserva do site white-label, aberto pela lista única de Reservas. Fica neste
 * formato até a fase 3 (reservas-unificadas-hub-wl.md § 4.2), que leva a reserva do site para o
 * mesmo layout da página de detalhe do Hub.
 */
function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-hairline py-2 text-body-sm last:border-0">
      <span className="text-muted">{rotulo}</span>
      <span className="text-right text-ink">{valor}</span>
    </div>
  );
}

export function WlBookingDetail({
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
                Reserva feita no site white-label. Para cancelar ou mudar a data, use o painel do site.
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
