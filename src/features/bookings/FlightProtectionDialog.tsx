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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBRL, formatDateTime } from "@/lib/format";
import { useExtendBookingFlightDelay } from "./customerApi";
import { FLIGHT_EXTENSION_MAX_HOURS } from "./booking-modifications.logic";
import { FLIGHT_KINDS, FLIGHT_KIND_LABEL, coveredCheckOut, overageDays, type FlightKind } from "./flightProtection.logic";

type Props = {
  bookingCode: string;
  currentCheckOut: string;
  /** Número do voo já informado no checkout, para pré-preencher. */
  flightNumber: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** `datetime-local` trabalha em hora local, sem fuso; converte de e para ISO. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Proteção de voo: atraso ou cancelamento (Superflex). A Movepark cobre até 24h de saída a mais,
 * uma vez por reserva. O que passar disso o estacionamento cobra no balcão, pela tabela dele. O
 * número do voo é a prova; a regra toda mora na RPC (25/09/2026).
 */
export function FlightProtectionDialog({ bookingCode, currentCheckOut, flightNumber, open, onOpenChange }: Props) {
  const extend = useExtendBookingFlightDelay();
  const defaultIso = React.useMemo(
    () => new Date(new Date(currentCheckOut).getTime() + FLIGHT_EXTENSION_MAX_HOURS * 3_600_000).toISOString(),
    [currentCheckOut],
  );
  const [kind, setKind] = React.useState<FlightKind>("delay");
  const [newCheckOut, setNewCheckOut] = React.useState(toLocalInput(defaultIso));
  const [flight, setFlight] = React.useState(flightNumber ?? "");

  React.useEffect(() => {
    if (open) {
      setKind("delay");
      setNewCheckOut(toLocalInput(defaultIso));
      setFlight(flightNumber ?? "");
    }
  }, [open, defaultIso, flightNumber]);

  const alvo = new Date(newCheckOut);
  const alvoOk = !Number.isNaN(alvo.getTime()) && alvo > new Date(currentCheckOut);
  const coberta = alvoOk ? coveredCheckOut(currentCheckOut, alvo.toISOString()) : null;
  const diasAlem = coberta ? overageDays(coberta, alvo.toISOString()) : 0;

  async function save() {
    if (!alvoOk) {
      toast.error("Escolha uma saída depois da atual.");
      return;
    }
    if (flight.trim().length < 2) {
      toast.error("Informe o número do voo.");
      return;
    }
    try {
      const r = await extend.mutateAsync({ bookingCode, newCheckOutAt: alvo.toISOString(), flightNumber: flight.trim().toUpperCase(), kind });
      if (r.overage_cents > 0) {
        toast.success(`Até ${formatDateTime(r.new_check_out_at)} é por nossa conta. Depois disso, ${formatBRL(r.overage_daily_cents / 100)} por dia, pago no estacionamento.`);
      } else {
        toast.success(`Saída estendida até ${formatDateTime(r.new_check_out_at)}, sem custo.`);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível estender a reserva.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Meu voo atrasou ou foi cancelado</DialogTitle>
          <DialogDescription>
            A Superflex cobre até {FLIGHT_EXTENSION_MAX_HOURS}h de saída a mais, uma vez, por nossa conta. Saída atual:{" "}
            {formatDateTime(currentCheckOut)}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flight-kind">O que aconteceu</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as FlightKind)}>
              <SelectTrigger id="flight-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FLIGHT_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {FLIGHT_KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flight-new-checkout">Nova saída prevista</Label>
            <Input
              id="flight-new-checkout"
              type="datetime-local"
              value={newCheckOut}
              min={toLocalInput(currentCheckOut)}
              onChange={(e) => setNewCheckOut(e.target.value)}
            />
            {coberta && (
              <span className="text-caption text-muted" data-testid="flight-coverage-hint">
                Até {formatDateTime(coberta)} é por nossa conta.
                {diasAlem > 0 ? " Depois disso, o estacionamento cobra a diária dele na retirada." : ""}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flight-number">Número do voo</Label>
            <Input
              id="flight-number"
              value={flight}
              onChange={(e) => setFlight(e.target.value)}
              placeholder="LA3456"
              maxLength={16}
              autoCapitalize="characters"
            />
            <span className="text-caption text-muted">Fica registrado na reserva como prova.</span>
          </div>
        </div>

        <Button className="w-full" onClick={save} disabled={extend.isPending}>
          {extend.isPending ? "Estendendo…" : "Estender a saída"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
