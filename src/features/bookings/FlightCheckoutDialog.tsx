import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL, formatDateTime } from "@/lib/format";
import { useRecordFlightCheckout } from "./api";
import { checkoutPlan } from "./flightCheckout.logic";
import type { OperatorExtension } from "./flightCheckout.logic";

type Props = {
  bookingId: string;
  extension: OperatorExtension;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Check-out de reserva com proteção de voo acionada (25/09/2026): o Operator registra a hora real
 * de retirada e o que cobrou no balcão pelo que passou da saída coberta. A RPC conclui a reserva.
 */
export function FlightCheckoutDialog({ bookingId, extension, open, onOpenChange }: Props) {
  const record = useRecordFlightCheckout();
  const [actual, setActual] = React.useState(toLocalInput(new Date()));
  const [charged, setCharged] = React.useState("");
  const [naoCobrado, setNaoCobrado] = React.useState(false);
  const [note, setNote] = React.useState("");

  const actualDate = new Date(actual);
  const actualOk = !Number.isNaN(actualDate.getTime());
  const plan = actualOk ? checkoutPlan(extension, actualDate.toISOString()) : { days: 0, forecastCents: 0 };

  React.useEffect(() => {
    if (open) {
      setActual(toLocalInput(new Date()));
      setNaoCobrado(false);
      setNote("");
    }
  }, [open]);
  React.useEffect(() => {
    if (!naoCobrado) setCharged(plan.forecastCents > 0 ? (plan.forecastCents / 100).toFixed(2) : "");
  }, [plan.forecastCents, naoCobrado]);

  async function registrar() {
    if (!actualOk) {
      toast.error("Informe a hora real de retirada.");
      return;
    }
    const cents = naoCobrado ? 0 : Math.round(Number(charged.replace(",", ".")) * 100);
    if (!naoCobrado && plan.forecastCents > 0 && (!Number.isFinite(cents) || cents < 0)) {
      toast.error("Informe o valor cobrado, ou marque que não foi cobrado.");
      return;
    }
    if (naoCobrado && plan.forecastCents > 0 && note.trim().length < 3) {
      toast.error("Diga em poucas palavras por que não foi cobrado.");
      return;
    }
    try {
      await record.mutateAsync({ bookingId, actualCheckOutAt: actualDate.toISOString(), chargedCents: Number.isFinite(cents) ? cents : 0, note: note.trim() || null });
      toast.success("Check-out registrado.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao registrar o check-out.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Check-out com proteção de voo</DialogTitle>
          <DialogDescription>
            Saída coberta pela Movepark até {formatDateTime(extension.new_check_out_at)}. O que passar disso é cobrado no
            balcão, pela sua tabela, e fica com você.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flight-actual">Hora real de retirada</Label>
            <Input id="flight-actual" type="datetime-local" value={actual} onChange={(e) => setActual(e.target.value)} />
          </div>
          <p className="text-body-sm text-body" data-testid="flight-checkout-plan">
            {plan.days === 0
              ? "Dentro da saída coberta: nada a cobrar."
              : `${plan.days} dia${plan.days === 1 ? "" : "s"} além da saída coberta: previsto ${formatBRL(plan.forecastCents / 100)}.`}
          </p>
          {plan.days > 0 && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="flight-charged">Cobrado no balcão (R$)</Label>
                <Input id="flight-charged" inputMode="decimal" value={charged} disabled={naoCobrado} onChange={(e) => setCharged(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-body-sm text-body">
                <input type="checkbox" checked={naoCobrado} onChange={(e) => setNaoCobrado(e.target.checked)} />
                Não cobrado
              </label>
              {naoCobrado && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="flight-note">Por quê</Label>
                  <Input id="flight-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cliente saiu antes de abrirmos o caixa" maxLength={200} />
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={registrar} disabled={record.isPending}>
            {record.isPending ? "Registrando…" : "Registrar check-out"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
