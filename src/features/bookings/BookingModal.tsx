import * as React from "react";
import { bookingCustomerName } from "./bookings.logic";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDateTime } from "@/lib/format";
import type { BookingWithRelations } from "@/types/domain";
import { useAuth } from "@/auth/context";
import { useCancelBookingStaff } from "./api";
import { paymentState } from "./payment.logic";

type Props = {
  booking: BookingWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BookingModal({ booking, open, onOpenChange }: Props) {
  const { hasScope } = useAuth();
  const cancelMutation = useCancelBookingStaff();
  const [confirming, setConfirming] = React.useState(false);

  // Reseta a confirmação ao fechar/trocar de reserva.
  React.useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);

  if (!booking) return null;

  const pay = paymentState(booking.payments);
  // Cancelar (que reembolsa) só antes do check-in — e com escopo. Depois do check-in não há estorno.
  const canCancel =
    (booking.status === "pending" || booking.status === "confirmed") &&
    hasScope("bookings:cancel", booking.location?.company?.id);

  const refundHint = pay.canRefund
    ? `estorna ${formatBRL(booking.total_amount)} ao cliente`
    : pay.badge === "Estornado"
      ? "o valor já foi estornado"
      : null;

  function handleCancel() {
    cancelMutation.mutate(booking!.code, {
      onSuccess: (r) => {
        toast.success(
          r.refunded
            ? r.refund_pending
              ? "Reserva cancelada. Estorno do PIX em processamento."
              : "Reserva cancelada e valor estornado."
            : "Reserva cancelada.",
        );
        onOpenChange(false);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao cancelar"),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reserva {booking.code}</DialogTitle>
          <div className="flex items-center gap-2 pt-1">
            <StatusBadge status={booking.status} />
            {pay.badge && (
              <span className="rounded-sm bg-surface-soft px-2 py-0.5 text-caption text-muted-steel">
                {pay.badge}
              </span>
            )}
            <span className="text-body-sm text-muted">
              {booking.location?.company?.name} · {booking.location?.name}
            </span>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 text-body-sm">
          <Field label="Cliente" value={bookingCustomerName(booking) ?? "-"} />
          <Field label="Telefone" value={booking.customer_phone ?? "-"} />
          <Field label="Check-in" value={formatDateTime(booking.check_in_at)} />
          <Field label="Check-out" value={formatDateTime(booking.check_out_at)} />
          <Field label="Veículo" value={booking.vehicle?.license_plate ?? "-"} />
          <Field label="Valor total" value={formatBRL(booking.total_amount)} />
        </div>

        <Separator />

        <div className="space-y-2">
          <h4 className="text-title-md">Linha do tempo</h4>
          <ol className="space-y-1 text-body-sm">
            <li className="text-muted">Criada em {formatDateTime(booking.created_at)}</li>
            {booking.checked_in_at && (
              <li className="text-muted">Check-in em {formatDateTime(booking.checked_in_at)}</li>
            )}
            {booking.checked_out_at && (
              <li className="text-muted">Check-out em {formatDateTime(booking.checked_out_at)}</li>
            )}
            {booking.deleted_at && (
              <li className="text-error">Cancelada em {formatDateTime(booking.deleted_at)}</li>
            )}
          </ol>
        </div>

        {canCancel && (
          <div className="flex flex-col items-end gap-2 pt-2">
            {!confirming ? (
              <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
                Cancelar reserva
              </Button>
            ) : (
              <div className="w-full space-y-2 rounded-md border border-hairline bg-surface-soft p-3">
                <p className="text-body-sm text-ink">
                  Cancela a reserva{refundHint ? ` e ${refundHint}` : ""}. Só é possível antes do
                  check-in. Confirmar?
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirming(false)}
                    disabled={cancelMutation.isPending}
                  >
                    Voltar
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleCancel}
                    disabled={cancelMutation.isPending}
                  >
                    {cancelMutation.isPending ? "Cancelando…" : "Confirmar cancelamento"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-caption text-muted">{label}</div>
      <div className="text-ink">{value}</div>
    </div>
  );
}
