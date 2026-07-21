import { ExternalLink } from "lucide-react";
import { formatBRL, formatDateTime, formatDuration } from "@/lib/format";
import { freeCancelDeadlineLabel, cancellationPolicyLines } from "@/features/bookings/cancellation.logic";
import { useAvailability } from "@/features/listing/api";
import type { BookingForCheckout } from "./api";

type Props = {
  booking: BookingForCheckout;
  /** Quando true, renderiza o conteúdo sem o wrapper de card (border/shadow). */
  bare?: boolean;
};

export function SummaryCard({ booking, bare }: Props) {
  const parkingItem = booking.items.find((i) => i.item_type === "parking");
  const addOns = booking.items.filter((i) => i.item_type === "add_on");

  const avail = useAvailability({
    companySlug: booking.location.company.slug,
    locationSlug: booking.location.slug,
    parkingTypeCode: parkingItem?.parking_type?.code ?? "",
    from: new Date(booking.check_in_at),
    to: new Date(booking.check_out_at),
  });
  const nearCapacity = !avail.data?.sold_out && (avail.data?.near_capacity ?? false);
  const scarcityMsg =
    nearCapacity && avail.data
      ? avail.data.remaining > 0
        ? `Faltam ${avail.data.remaining} vaga${avail.data.remaining === 1 ? "" : "s"} para esse período`
        : (avail.data.near_capacity_message ?? "Restam poucas vagas")
      : null;

  const breakdown = booking.price_breakdown;
  const oldPrice =
    breakdown?.old_price != null && parkingItem && breakdown.old_price > parkingItem.subtotal
      ? breakdown.old_price
      : null;

  const mapsUrl = booking.location.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(booking.location.address)}`
    : null;

  const content = (
    <>
      {/* Cabeçalho — omitido no modo bare pois o accordion já exibe nome e preço */}
      {!bare && (
        <>
          <div className="space-y-0.5">
            <h3 className="text-title-md text-ink">
              {booking.location.company.name}
              {parkingItem?.parking_type?.name ? ` • ${parkingItem.parking_type.name}` : ""}
            </h3>
            <p className="text-body-sm text-muted">{booking.location.name}</p>
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-body-sm text-mp-primary hover:underline"
              >
                Ver endereço
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          <div className="my-4 h-px bg-hairline" />
        </>
      )}

      {/* Sinal de escassez */}
      {scarcityMsg && (
        <div className="mb-4 rounded-sm border border-badge-pending-fg/20 bg-badge-pending-bg px-3 py-2 text-caption font-medium text-badge-pending-fg">
          {scarcityMsg}
        </div>
      )}

      {/* Datas */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-body-sm">
          <span className="text-muted">Check-in</span>
          <span className="text-ink tabular-nums">{formatDateTime(booking.check_in_at)}</span>
        </div>
        <div className="flex justify-between text-body-sm">
          <span className="text-muted">Check-out</span>
          <span className="text-ink tabular-nums">{formatDateTime(booking.check_out_at)}</span>
        </div>
        <div className="flex justify-between text-body-sm">
          <span className="text-muted">Duração</span>
          <span className="text-ink">{formatDuration(booking.check_in_at, booking.check_out_at)}</span>
        </div>
        {booking.passenger_count != null && (
          <div className="flex justify-between text-body-sm">
            <span className="text-muted">Passageiros</span>
            <span className="text-ink tabular-nums">{booking.passenger_count}</span>
          </div>
        )}
      </div>

      <div className="my-4 h-px bg-hairline" />

      {/* Itens */}
      <div className="space-y-1.5">
        {parkingItem && (
          <div className="flex justify-between text-body-sm">
            <span className="text-ink">
              {parkingItem.parking_type?.name} × {parkingItem.quantity}
            </span>
            <span className="tabular-nums">
              {oldPrice && (
                <span className="mr-1.5 text-muted line-through">{formatBRL(oldPrice)}</span>
              )}
              <span className="text-ink">{formatBRL(parkingItem.subtotal)}</span>
            </span>
          </div>
        )}
        {addOns.map((a) => (
          <div key={a.id} className="flex justify-between text-body-sm">
            <span className="text-ink">{a.add_on_service?.name}</span>
            <span className="text-ink tabular-nums">{formatBRL(a.subtotal)}</span>
          </div>
        ))}
        {booking.coupon && (
          <div className="flex justify-between text-body-sm text-badge-confirmed-fg">
            <span>Cupom {booking.coupon.code}</span>
            <span className="tabular-nums">−{formatBRL(booking.coupon.discount_applied)}</span>
          </div>
        )}
        {breakdown?.fare && breakdown.fare.amount > 0 && (
          <div className="flex justify-between text-body-sm">
            <span className="text-ink">Tarifa {breakdown.fare.label}</span>
            <span className="text-ink tabular-nums">{formatBRL(breakdown.fare.amount)}</span>
          </div>
        )}
      </div>

      <div className="my-4 h-px bg-hairline" />

      {/* Total */}
      <div className="flex items-baseline justify-between">
        <span className="text-body-md text-muted">Total</span>
        <span className="text-display-md text-ink tabular-nums">
          {formatBRL(booking.total_amount)}
        </span>
      </div>

      <div className="my-4 h-px bg-hairline" />

      {/* Política de cancelamento */}
      <div className="space-y-2">
        <div className="rounded-full bg-badge-confirmed-bg px-4 py-2 text-center text-caption text-badge-confirmed-fg">
          {freeCancelDeadlineLabel(booking.check_in_at, booking.fare_cancel_until)}
        </div>
        <div className="rounded-md bg-surface-soft px-4 py-3 text-center text-body-sm text-body">
          {cancellationPolicyLines(booking.check_in_at, booking.fare_cancel_until).join(" ")}
        </div>
      </div>
    </>
  );

  if (bare) return content;

  return (
    <div className="rounded-md border border-hairline bg-canvas p-6 shadow-tier">{content}</div>
  );
}
