import { ArrowSquareOut, ShieldCheck, Storefront } from "@phosphor-icons/react";
import { formatBRL, formatDuration } from "@/lib/format";
import { parkingTitle } from "@/lib/parkingName";
import {
  freeCancelDeadlineLabel,
  cancellationPolicyLines,
} from "@/features/bookings/cancellation.logic";
import { useAvailability } from "@/features/listing/api";
import { dateCell } from "./summary.logic";
import type { BookingForCheckout } from "./api";

type Props = {
  booking: BookingForCheckout;
  /** Quando true, renderiza o conteúdo sem o wrapper de card (border/shadow). */
  bare?: boolean;
};

/** Célula de data: rótulo em cima, dia em destaque, hora embaixo. */
function DataCell({ label, value }: { label: string; value: string }) {
  const { dia, hora } = dateCell(value);
  return (
    <div className="min-w-0 flex-1 rounded-md border border-hairline bg-surface-soft px-3 py-2.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.4px] text-muted">{label}</p>
      <p className="mt-1 truncate text-title-sm text-ink">{dia}</p>
      <p className="text-body-sm tabular-nums text-muted">{hora}</p>
    </div>
  );
}

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

  const foto = booking.location.photos[0] ?? null;
  const duracao = formatDuration(booking.check_in_at, booking.check_out_at);

  const content = (
    <>
      {/* Cabeçalho — omitido no modo bare pois o accordion já exibe nome e preço */}
      {!bare && (
        <>
          <div className="flex items-start gap-3">
            {foto ? (
              <img
                src={foto}
                alt=""
                loading="lazy"
                className="h-14 w-14 shrink-0 rounded-md object-cover"
              />
            ) : (
              /* Sem foto o bloco não some: o vazio desalinharia o cabeçalho. */
              <span
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-mp-pale text-mp-indigo"
                aria-hidden
              >
                <Storefront className="h-6 w-6" />
              </span>
            )}
            <div className="min-w-0 space-y-0.5">
              <h3 className="text-title-md text-ink">
                {parkingTitle(booking.location.company.name, booking.location.name)}
              </h3>
              {parkingItem?.parking_type?.name && (
                <p className="text-body-sm text-muted">{parkingItem.parking_type.name}</p>
              )}
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-body-sm text-mp-primary hover:underline"
                >
                  Ver endereço
                  <ArrowSquareOut className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
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

      {/* Datas lado a lado: é o par que o cliente confere primeiro. */}
      <div className="flex gap-3">
        <DataCell label="Check-in" value={booking.check_in_at} />
        <DataCell label="Check-out" value={booking.check_out_at} />
      </div>

      {/* Duração e passageiros ficam numa linha só, abaixo das datas. */}
      <p className="mt-2 text-body-sm text-muted">
        {duracao}
        {booking.passenger_count != null && ` · ${booking.passenger_count} passageiro${booking.passenger_count === 1 ? "" : "s"}`}
      </p>

      <div className="my-4 h-px bg-hairline" />

      {/* Total antes do detalhamento: é o número que a pessoa procura. */}
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-display-md text-ink tabular-nums">
          {formatBRL(booking.total_amount)}
        </span>
        <span className="text-body-sm text-muted">Total</span>
      </div>

      {/* Itens */}
      <div className="mt-3 space-y-1.5">
        {parkingItem && (
          <div className="flex justify-between gap-3 text-body-sm">
            <span className="text-muted">
              {parkingItem.parking_type?.name} × {parkingItem.quantity}
            </span>
            <span className="shrink-0 tabular-nums">
              {oldPrice && (
                <span className="mr-1.5 text-muted line-through">{formatBRL(oldPrice)}</span>
              )}
              <span className="text-ink">{formatBRL(parkingItem.subtotal)}</span>
            </span>
          </div>
        )}
        {addOns.map((a) => (
          <div key={a.id} className="flex justify-between gap-3 text-body-sm">
            <span className="text-muted">{a.add_on_service?.name}</span>
            <span className="shrink-0 text-ink tabular-nums">{formatBRL(a.subtotal)}</span>
          </div>
        ))}
        {booking.coupon && (
          <div className="flex justify-between gap-3 text-body-sm text-badge-confirmed-fg">
            <span>Cupom {booking.coupon.code}</span>
            <span className="shrink-0 tabular-nums">
              −{formatBRL(booking.coupon.discount_applied)}
            </span>
          </div>
        )}
        {breakdown?.fare && breakdown.fare.amount > 0 && (
          <div className="flex justify-between gap-3 text-body-sm">
            <span className="text-muted">Tarifa {breakdown.fare.label}</span>
            <span className="shrink-0 text-ink tabular-nums">
              {formatBRL(breakdown.fare.amount)}
            </span>
          </div>
        )}
      </div>

      <div className="my-4 h-px bg-hairline" />

      {/* Política de cancelamento */}
      <div className="flex items-center gap-2 rounded-md bg-badge-confirmed-bg px-3 py-2.5 text-caption font-medium text-badge-confirmed-fg">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
        <span>
          {freeCancelDeadlineLabel(booking.check_in_at, booking.fare_cancel_until, (d) => {
            const { dia, hora } = dateCell(d);
            return `${dia} · ${hora}`;
          })}
        </span>
      </div>
      <p className="mt-2 text-caption-sm leading-relaxed text-muted">
        {cancellationPolicyLines(booking.check_in_at, booking.fare_cancel_until).join(" ")}
      </p>
    </>
  );

  if (bare) return content;

  return (
    <div className="rounded-md border border-hairline bg-canvas p-6 shadow-tier">{content}</div>
  );
}
