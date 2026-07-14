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
import { DateRangeField } from "@/features/search/DateRangeField";
import { formatBRL } from "@/lib/format";
import { toDataUrl } from "@/lib/qr";
import { useChangePaidBookingDates, type ChangePaidDatesResult } from "./customerApi";

type Props = {
  bookingCode: string;
  currentCheckIn: string;
  currentCheckOut: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Altera as datas de uma reserva PAGA (E2.8-h). Mais caro: gera um PIX da diferença (aplica quando
 * pago). Mais barato ou igual: aplica na hora (e estorna a diferença se houver).
 */
export function ChangeDatesPaidDialog({
  bookingCode,
  currentCheckIn,
  currentCheckOut,
  open,
  onOpenChange,
}: Props) {
  const change = useChangePaidBookingDates();
  const [from, setFrom] = React.useState<Date | null>(new Date(currentCheckIn));
  const [to, setTo] = React.useState<Date | null>(new Date(currentCheckOut));
  const [charge, setCharge] = React.useState<
    Extract<ChangePaidDatesResult, { mode: "charge" }> | null
  >(null);
  const [qrUrl, setQrUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setFrom(new Date(currentCheckIn));
      setTo(new Date(currentCheckOut));
      setCharge(null);
      setQrUrl(null);
    }
  }, [open, currentCheckIn, currentCheckOut]);

  async function save() {
    if (!from || !to || to <= from) {
      toast.error("Escolha um período válido.");
      return;
    }
    try {
      const res = await change.mutateAsync({
        bookingCode,
        checkInAt: from.toISOString(),
        checkOutAt: to.toISOString(),
      });
      if (res.mode === "charge") {
        setCharge(res);
        if (res.qr_code) setQrUrl(await toDataUrl(res.qr_code, 220));
        return;
      }
      if (res.refunded) {
        toast.success(
          `Datas alteradas. Devolvemos ${formatBRL(Math.abs(res.delta))} da diferença${
            res.refund_pending ? ", que seu banco credita em alguns dias" : ""
          }.`,
        );
      } else {
        toast.success("Datas da reserva atualizadas.");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar datas");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar datas</DialogTitle>
          <DialogDescription>
            {charge
              ? "Pague a diferença por PIX para confirmar as novas datas."
              : "Escolha o novo período. O valor é recalculado e a diferença é cobrada ou devolvida."}
          </DialogDescription>
        </DialogHeader>

        {charge ? (
          <div className="space-y-3 text-center">
            <p className="text-body-sm text-muted">
              Diferença de <strong className="text-ink">{formatBRL(charge.delta)}</strong>. As novas
              datas valem assim que o pagamento for confirmado.
            </p>
            {qrUrl && <img src={qrUrl} alt="QR code do PIX" className="mx-auto h-[220px] w-[220px]" />}
            <p className="break-all rounded-sm bg-surface-soft p-2 text-caption text-muted">
              {charge.qr_code}
            </p>
            <Button variant="secondary" className="w-full" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        ) : (
          <>
            <div className="rounded-md border border-hairline">
              <div className="grid grid-cols-2 divide-x divide-hairline">
                <DateRangeField mode="check-in" date={from} onChange={setFrom} />
                <DateRangeField
                  mode="check-out"
                  date={to}
                  onChange={setTo}
                  minDate={from ?? undefined}
                />
              </div>
            </div>
            <Button className="w-full" onClick={save} disabled={change.isPending}>
              {change.isPending ? "Calculando…" : "Confirmar novas datas"}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
