import * as React from "react";
import { bookingCustomerName } from "./bookings.logic";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatBRL, formatDateTime } from "@/lib/format";
import { documentMask } from "@/lib/masks";
import type { BookingStatus, BookingWithRelations } from "@/types/domain";
import { useCancelBookingStaff, useUpdateBookingStatus } from "./api";
import { useChangeBookingVehicle } from "./customerApi";
import { paymentState } from "./payment.logic";

type Props = {
  booking: BookingWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const allowed: Record<BookingStatus, BookingStatus[]> = {
  pending: ["confirmed", "cancelled"],
  // confirmada: cliente chegou (check-in) / não compareceu (no-show) / cancelar (estorno)
  confirmed: ["checked_in", "no_show", "cancelled"],
  checked_in: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function BookingDrawer({ booking, open, onOpenChange }: Props) {
  const mutation = useUpdateBookingStatus();
  const cancelMutation = useCancelBookingStaff();
  const changeVehicle = useChangeBookingVehicle();
  const [plate, setPlate] = React.useState("");
  const busy = mutation.isPending || cancelMutation.isPending;

  if (!booking) return null;

  // Badge de estado do estorno (Estornado / em processamento), quando houver.
  const pay = paymentState(booking.payments);

  async function savePlate() {
    const lp = plate.trim().toUpperCase();
    if (!lp) return;
    try {
      await changeVehicle.mutateAsync({ bookingCode: booking!.code, licensePlate: lp });
      toast.success("Placa atualizada.");
      setPlate("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao trocar placa");
    }
  }

  function transition(status: BookingStatus, label: string) {
    const patch: Parameters<typeof mutation.mutate>[0] = {
      bookingId: booking!.id,
      status,
    };
    if (status === "checked_in")
      patch.timestamp = { field: "checked_in_at", value: new Date().toISOString() };
    if (status === "completed")
      patch.timestamp = { field: "checked_out_at", value: new Date().toISOString() };

    mutation.mutate(patch, {
      onSuccess: () => toast.success(`${label} com sucesso`),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao atualizar"),
    });
  }

  // Cancelar passa pela Edge cancel-booking (estorna o pagamento quando aplicável, E0.3.2).
  function cancel() {
    cancelMutation.mutate(booking!.code, {
      onSuccess: (r) =>
        toast.success(
          r.refunded
            ? r.refund_pending
              ? "Reserva cancelada. Estorno do PIX em processamento."
              : "Reserva cancelada e valor estornado."
            : "Reserva cancelada",
        ),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao cancelar"),
    });
  }

  const next = allowed[booking.status];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Reserva {booking.code}</SheetTitle>
          <div className="flex items-center gap-2">
            <StatusBadge status={booking.status} />
            {pay.badge && (
              <span className="rounded-sm bg-surface-soft px-2 py-0.5 text-caption text-muted-steel">
                {pay.badge}
              </span>
            )}
            <span className="text-body-sm text-muted">{booking.location?.name}</span>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pb-6">
          <section className="space-y-2">
            <h4 className="text-title-md">Cliente</h4>
            <Field label="Nome" value={bookingCustomerName(booking) ?? "-"} />
            <Field label="Telefone" value={booking.customer_phone ?? "-"} />
            <Field
              label="CPF/CNPJ"
              value={booking.profile?.tax_id ? documentMask(booking.profile.tax_id) : "-"}
            />
          </section>

          <Separator />

          <section className="space-y-2">
            <h4 className="text-title-md">Veículo</h4>
            <Field label="Placa" value={booking.vehicle?.license_plate ?? "-"} />
            <Field label="Modelo" value={booking.vehicle?.model ?? "-"} />
            <Field label="Cor" value={booking.vehicle?.color ?? "-"} />
            {["pending", "confirmed", "checked_in"].includes(booking.status) && (
              <div className="flex items-center gap-2 pt-1">
                <Input
                  value={plate}
                  onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  placeholder="Nova placa"
                  className="h-9 flex-1 uppercase"
                  aria-label="Nova placa"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={savePlate}
                  disabled={!plate.trim() || changeVehicle.isPending}
                >
                  Trocar placa
                </Button>
              </div>
            )}
          </section>

          <Separator />

          <section className="space-y-2">
            <h4 className="text-title-md">Reserva</h4>
            <Field label="Check-in" value={formatDateTime(booking.check_in_at)} />
            <Field label="Check-out" value={formatDateTime(booking.check_out_at)} />
            <Field label="Total" value={formatBRL(booking.total_amount)} />
            {booking.notes && <Field label="Notas" value={booking.notes} />}
          </section>

          {next.length > 0 && (
            <>
              <Separator />
              <section className="flex flex-wrap gap-2">
                {next.includes("confirmed") && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => transition("confirmed", "Reserva confirmada")}
                  >
                    Confirmar
                  </Button>
                )}
                {next.includes("checked_in") && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => transition("checked_in", "Check-in registrado")}
                  >
                    Check-in
                  </Button>
                )}
                {next.includes("completed") && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => transition("completed", "Check-out registrado")}
                  >
                    Check-out
                  </Button>
                )}
                {next.includes("no_show") && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => transition("no_show", "Reserva marcada como não comparecimento")}
                  >
                    Não compareceu
                  </Button>
                )}
                {next.includes("cancelled") && (
                  <Button size="sm" variant="danger" disabled={busy} onClick={cancel}>
                    {cancelMutation.isPending ? "Cancelando…" : "Cancelar"}
                  </Button>
                )}
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between text-body-sm">
      <span className="text-muted">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}
