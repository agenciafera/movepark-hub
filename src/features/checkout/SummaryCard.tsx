import { Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDateTime, formatDuration } from "@/lib/format";
import type { BookingForCheckout } from "./api";

type Props = {
  booking: BookingForCheckout;
  onEdit?: () => void;
};

export function SummaryCard({ booking, onEdit }: Props) {
  const parkingItem = booking.items.find((i) => i.item_type === "parking");
  const addOns = booking.items.filter((i) => i.item_type === "add_on");

  return (
    <div className="rounded-md border border-hairline bg-canvas p-6 shadow-tier">
      <div className="space-y-1">
        <h3 className="text-title-md text-ink">
          {parkingItem?.parking_type?.name ?? "Vaga"} ·{" "}
          {booking.location.company.name}
        </h3>
        <p className="text-body-sm text-muted">{booking.location.name}</p>
      </div>

      <div className="my-4 h-px bg-hairline" />

      <div className="space-y-1.5">
        <div className="flex justify-between text-body-sm">
          <span className="text-muted">Check-in</span>
          <span className="text-ink tabular-nums">
            {formatDateTime(booking.check_in_at)}
          </span>
        </div>
        <div className="flex justify-between text-body-sm">
          <span className="text-muted">Check-out</span>
          <span className="text-ink tabular-nums">
            {formatDateTime(booking.check_out_at)}
          </span>
        </div>
        <div className="flex justify-between text-body-sm">
          <span className="text-muted">Duração</span>
          <span className="text-ink">
            {formatDuration(booking.check_in_at, booking.check_out_at)}
          </span>
        </div>
        {booking.passenger_count != null && (
          <div className="flex justify-between text-body-sm">
            <span className="text-muted">Passageiros</span>
            <span className="text-ink tabular-nums">
              {booking.passenger_count}
            </span>
          </div>
        )}
      </div>

      <div className="my-4 h-px bg-hairline" />

      <div className="space-y-1.5">
        {parkingItem && (
          <div className="flex justify-between text-body-sm">
            <span className="text-ink">
              {parkingItem.parking_type?.name} × {parkingItem.quantity}
            </span>
            <span className="text-ink tabular-nums">
              {formatBRL(parkingItem.subtotal)}
            </span>
          </div>
        )}
        {addOns.map((a) => (
          <div key={a.id} className="flex justify-between text-body-sm">
            <span className="text-ink">{a.add_on_service?.name}</span>
            <span className="text-ink tabular-nums">{formatBRL(a.subtotal)}</span>
          </div>
        ))}
      </div>

      <div className="my-4 h-px bg-hairline" />

      <div className="flex items-baseline justify-between">
        <span className="text-title-md text-ink">Total</span>
        <span className="text-display-sm text-ink tabular-nums">
          {formatBRL(booking.total_amount)}
        </span>
      </div>

      {onEdit && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className="mt-4 w-full justify-center"
        >
          <Edit2 className="h-3.5 w-3.5" />
          Editar reserva
        </Button>
      )}
    </div>
  );
}
