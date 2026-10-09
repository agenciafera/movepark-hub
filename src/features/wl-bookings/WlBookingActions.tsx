import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useWlBookingAction, useWlBookingActions } from "./api";
import { canMarkArrived } from "./wlBooking.logic";
import type { WlBookingRow } from "@/types/domain";

/**
 * Check-in, no-show e troca de placa, gravados no site do parceiro pela Edge `wl-booking-action`.
 * Card "Operação" da tela da reserva do site. Só aparece com a chave de ações ligada e com permissão (check-in: bookings:checkin; placa:
 * bookings:write). A regra de verdade é do site e do servidor; aqui só não se oferece o que vai
 * ser recusado.
 */
export function WlBookingActions({
  booking,
  onChanged,
}: {
  booking: WlBookingRow;
  onChanged?: (patch: Partial<WlBookingRow>) => void;
}) {
  const perms = useWlBookingActions(booking.company_id);
  const acao = useWlBookingAction();
  const [trocandoPlaca, setTrocandoPlaca] = React.useState(false);
  const [placa, setPlaca] = React.useState("");
  const [motivo, setMotivo] = React.useState("");

  const p = perms.data;
  if (!p?.enabled || booking.status !== "confirmed" || (!p.attendance && !p.license_plate))
    return null;

  const marcar = (status: "compareceu" | "no_show" | "pendente") =>
    acao.mutate(
      { action: "attendance", wlBookingId: booking.id, status },
      {
        onSuccess: () => {
          onChanged?.({ attendance_status: status });
          toast.success(
            status === "compareceu" ? "Chegada registrada no site." : "Registrado no site.",
          );
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Não deu para registrar."),
      },
    );

  const trocarPlaca = () =>
    acao.mutate(
      {
        action: "license_plate",
        wlBookingId: booking.id,
        licensePlate: placa.trim(),
        reason: motivo.trim(),
      },
      {
        onSuccess: (data) => {
          onChanged?.({ license_plate: String(data.license_plate ?? placa.trim().toUpperCase()) });
          setTrocandoPlaca(false);
          setPlaca("");
          setMotivo("");
          toast.success("Placa trocada no site.");
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Não deu para trocar a placa."),
      },
    );

  const chegou = booking.attendance_status === "compareceu";
  const naoVeio = booking.attendance_status === "no_show";
  const podeChegar = canMarkArrived(booking.check_in_at);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Operação</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-body-sm text-muted">O que for marcado aqui fica gravado no site white-label.</p>
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
              <Button
                size="sm"
                variant="secondary"
                onClick={() => marcar("no_show")}
                disabled={acao.isPending}
              >
                Não veio
              </Button>
            ) : null}
            {chegou || naoVeio ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => marcar("pendente")}
                disabled={acao.isPending}
              >
                Desfazer marcação
              </Button>
            ) : null}
          </div>
        ) : null}

        {p.license_plate ? (
          trocandoPlaca ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="wl-nova-placa">Nova placa</Label>
              <Input
                id="wl-nova-placa"
                value={placa}
                onChange={(e) => setPlaca(e.target.value)}
                placeholder="ABC1D23"
              />
              <Label htmlFor="wl-motivo">Motivo</Label>
              <Textarea
                id="wl-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={trocarPlaca}
                  disabled={acao.isPending || !placa.trim() || !motivo.trim()}
                >
                  {acao.isPending ? "Salvando..." : "Salvar placa"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTrocandoPlaca(false)}
                  disabled={acao.isPending}
                >
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
      </CardContent>
    </Card>
  );
}
