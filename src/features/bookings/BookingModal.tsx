import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDateTime } from "@/lib/format";
import type { BookingWithRelations } from "@/types/domain";
import { paymentState } from "./payment.logic";

type Props = {
  booking: BookingWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel?: (booking: BookingWithRelations) => void;
};

export function BookingModal({ booking, open, onOpenChange, onCancel }: Props) {
  if (!booking) return null;

  const pay = paymentState(booking.payments);
  // Cancelar antes do check-in reembolsa (cancel-booking, E0.3.2). Estorno não é ação à parte.
  const canCancel = !!onCancel && (booking.status === "pending" || booking.status === "confirmed");

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
          <Field label="Cliente" value={booking.profile?.full_name ?? "—"} />
          <Field label="Telefone" value={booking.profile?.phone ?? "—"} />
          <Field label="Check-in" value={formatDateTime(booking.check_in_at)} />
          <Field label="Check-out" value={formatDateTime(booking.check_out_at)} />
          <Field label="Veículo" value={booking.vehicle?.license_plate ?? "—"} />
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
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="danger" size="sm" onClick={() => onCancel!(booking)}>
              Cancelar reserva
            </Button>
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
