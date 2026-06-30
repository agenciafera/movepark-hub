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
import { useChangeBookingDates } from "./customerApi";

type Props = {
  bookingCode: string;
  currentCheckIn: string;
  currentCheckOut: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Altera as datas de uma reserva pendente (benefício Flex+ `date_change`, E2.8-f). */
export function ChangeDatesDialog({ bookingCode, currentCheckIn, currentCheckOut, open, onOpenChange }: Props) {
  const change = useChangeBookingDates();
  const [from, setFrom] = React.useState<Date | null>(new Date(currentCheckIn));
  const [to, setTo] = React.useState<Date | null>(new Date(currentCheckOut));

  React.useEffect(() => {
    if (open) {
      setFrom(new Date(currentCheckIn));
      setTo(new Date(currentCheckOut));
    }
  }, [open, currentCheckIn, currentCheckOut]);

  async function save() {
    if (!from || !to || to <= from) {
      toast.error("Escolha um período válido.");
      return;
    }
    try {
      await change.mutateAsync({
        bookingCode,
        checkInAt: from.toISOString(),
        checkOutAt: to.toISOString(),
      });
      toast.success("Datas da reserva atualizadas. O valor foi recalculado.");
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
            Escolha o novo período. O valor da vaga é recalculado e o cupom (se houver) sai.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-hairline">
          <div className="grid grid-cols-2 divide-x divide-hairline">
            <DateRangeField mode="check-in" date={from} onChange={setFrom} />
            <DateRangeField mode="check-out" date={to} onChange={setTo} minDate={from ?? undefined} />
          </div>
        </div>

        <Button className="w-full" onClick={save} disabled={change.isPending}>
          {change.isPending ? "Salvando…" : "Confirmar novas datas"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
