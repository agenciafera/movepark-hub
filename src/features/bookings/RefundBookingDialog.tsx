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
import { formatBRL } from "@/lib/format";
import { useRefundBookingStaff } from "./api";

type Props = {
  bookingCode: string | null;
  totalAmount?: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefunded?: () => void;
};

/** Confirmação de ESTORNO AVULSO (staff): reembolsa o valor pago SEM cancelar a reserva. */
export function RefundBookingDialog({
  bookingCode,
  totalAmount,
  open,
  onOpenChange,
  onRefunded,
}: Props) {
  const refundMutation = useRefundBookingStaff();
  const [reason, setReason] = React.useState("");

  if (!bookingCode) return null;

  async function handleRefund() {
    try {
      const result = await refundMutation.mutateAsync({
        bookingCode: bookingCode!,
        reason: reason.trim() || undefined,
      });
      if (result.refund_pending) {
        toast.success("Estorno iniciado. O PIX será devolvido ao cliente pelo banco em alguns dias.");
      } else {
        toast.success("Valor estornado.");
      }
      setReason("");
      onOpenChange(false);
      onRefunded?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao estornar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Estornar reserva {bookingCode}</DialogTitle>
          <DialogDescription>
            Reembolsa {totalAmount != null ? formatBRL(totalAmount) : "o valor pago"} ao cliente.
            <strong className="text-ink"> Não cancela a reserva</strong> — é só o estorno do pagamento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-body-sm text-muted" htmlFor="refund-reason">
            Motivo (opcional)
          </label>
          <Input
            id="refund-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: cobrança em duplicidade"
          />
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button variant="danger" onClick={handleRefund} disabled={refundMutation.isPending}>
            {refundMutation.isPending ? "Estornando…" : "Confirmar estorno"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
