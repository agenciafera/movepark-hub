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
import { formatDateTime } from "@/lib/format";
import { useExtendBookingFlightDelay } from "./customerApi";
import { FLIGHT_EXTENSION_MAX_HOURS } from "./booking-modifications.logic";

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
 * Proteção contra atraso de voo (Superflex, Q-025 a Q-027): estende a saída em até 24h, uma vez
 * por reserva, sem custo para o cliente. O número do voo é a prova; a regra toda mora na RPC.
 */
export function FlightDelayDialog({ bookingCode, currentCheckOut, flightNumber, open, onOpenChange }: Props) {
  const extend = useExtendBookingFlightDelay();
  const maxIso = React.useMemo(
    () => new Date(new Date(currentCheckOut).getTime() + FLIGHT_EXTENSION_MAX_HOURS * 3_600_000).toISOString(),
    [currentCheckOut],
  );
  const [newCheckOut, setNewCheckOut] = React.useState(toLocalInput(maxIso));
  const [flight, setFlight] = React.useState(flightNumber ?? "");

  React.useEffect(() => {
    if (open) {
      setNewCheckOut(toLocalInput(maxIso));
      setFlight(flightNumber ?? "");
    }
  }, [open, maxIso, flightNumber]);

  async function save() {
    const alvo = new Date(newCheckOut);
    if (Number.isNaN(alvo.getTime()) || alvo <= new Date(currentCheckOut)) {
      toast.error("Escolha uma saída depois da atual.");
      return;
    }
    if (alvo.getTime() > new Date(maxIso).getTime()) {
      toast.error(`A proteção estende até ${FLIGHT_EXTENSION_MAX_HOURS}h depois da saída. Para mais tempo, altere a data.`);
      return;
    }
    if (flight.trim().length < 2) {
      toast.error("Informe o número do voo.");
      return;
    }
    try {
      const r = await extend.mutateAsync({ bookingCode, newCheckOutAt: alvo.toISOString(), flightNumber: flight.trim().toUpperCase() });
      toast.success(`Saída estendida até ${formatDateTime(r.new_check_out_at)}, sem custo.`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível estender a reserva.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Meu voo atrasou</DialogTitle>
          <DialogDescription>
            A Superflex estende a saída em até {FLIGHT_EXTENSION_MAX_HOURS}h, uma vez, sem custo. Saída atual:{" "}
            {formatDateTime(currentCheckOut)}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flight-new-checkout">Nova saída</Label>
            <Input
              id="flight-new-checkout"
              type="datetime-local"
              value={newCheckOut}
              min={toLocalInput(currentCheckOut)}
              max={toLocalInput(maxIso)}
              onChange={(e) => setNewCheckOut(e.target.value)}
            />
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
            <span className="text-caption text-muted">Fica registrado na reserva como prova do atraso.</span>
          </div>
        </div>

        <Button className="w-full" onClick={save} disabled={extend.isPending}>
          {extend.isPending ? "Estendendo…" : "Estender a saída"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
