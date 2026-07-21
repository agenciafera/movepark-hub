import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCancelMyBooking } from "./customerApi";
import { formatBRL, formatDateTime } from "@/lib/format";
import { cancellationStatus, freeCancelDeadlineLabel } from "./cancellation.logic";
import type { MyBookingDetail } from "./customerApi";

type Props = {
  booking: MyBookingDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled?: () => void;
};

export function CancelBookingDialog({
  booking,
  open,
  onOpenChange,
  onCancelled,
}: Props) {
  const cancelMutation = useCancelMyBooking();
  if (!booking) return null;

  // Janela da Tarifa (E2.8): Superflex = 1 min antes; senão padrão 24h (PRD-12).
  const isPending = booking.status === "pending";
  const isFree =
    !isPending &&
    cancellationStatus(booking.check_in_at, new Date(), booking.fare_cancel_until).free;
  // Confirmado fora da janela → bloqueado (só staff cancela). O botão de abrir já não aparece no
  // detalhe; aqui é defesa extra caso o dialog seja aberto mesmo assim.
  const isBlocked = booking.status === "confirmed" && !isFree;

  async function handleCancel() {
    try {
      const result = await cancelMutation.mutateAsync(booking!.code);
      if (result.refunded && result.refund_pending) {
        toast.success("Reserva cancelada. O estorno do PIX será devolvido pelo seu banco em alguns dias.");
      } else if (result.refunded) {
        toast.success("Reserva cancelada e valor estornado.");
      } else {
        toast.success("Reserva cancelada");
      }
      onOpenChange(false);
      onCancelled?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cancelar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar reserva {booking.code}</DialogTitle>
          <DialogDescription>
            Tem certeza? Essa ação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-body-sm">
          <div>
            <strong className="text-ink">Reserva:</strong>{" "}
            {booking.parking_type?.name ?? "Vaga"} ·{" "}
            {booking.location.company.name}
          </div>
          <div>
            <strong className="text-ink">Check-in:</strong>{" "}
            {formatDateTime(booking.check_in_at)}
          </div>
          <div
            className={
              isBlocked
                ? "rounded-sm bg-badge-cancelled-bg p-3 text-error"
                : isFree
                  ? "rounded-sm bg-badge-confirmed-bg p-3 text-success"
                  : "rounded-sm bg-badge-pending-bg p-3 text-warning"
            }
          >
            {isBlocked
              ? "A janela de cancelamento da sua tarifa já encerrou. Para cancelar, fale com o suporte."
              : isFree
                ? `Cancelamento grátis. Reembolso integral de ${formatBRL(booking.total_amount)} em até 10 dias úteis. ${freeCancelDeadlineLabel(booking.check_in_at, booking.fare_cancel_until)}.`
                : "Esta reserva ainda não foi paga. Cancelar libera a vaga na hora."}
          </div>
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Manter reserva
          </Button>
          <Button
            variant="danger"
            onClick={handleCancel}
            disabled={cancelMutation.isPending || isBlocked}
            data-testid="cancel-booking-confirm"
          >
            {cancelMutation.isPending ? "Cancelando…" : "Cancelar reserva"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
