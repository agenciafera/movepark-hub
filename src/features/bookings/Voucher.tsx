import * as React from "react";
import { Download, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toDataUrl } from "@/lib/qr";
import { formatDateTime } from "@/lib/format";
import { Wordmark } from "@/components/shared/Brand";
import type { MyBookingDetail } from "./customerApi";

type Props = {
  booking: MyBookingDetail;
};

export function Voucher({ booking }: Props) {
  const [qrUrl, setQrUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    const validateUrl = `${window.location.origin}/voucher/validate?code=${booking.code}`;
    toDataUrl(validateUrl, 240).then(setQrUrl);
  }, [booking.code]);

  return (
    <div className="rounded-md border border-hairline bg-canvas p-6 print:border-0 print:p-0">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <h3 className="text-title-md text-ink">Voucher</h3>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.print()}
          >
            <Download className="h-4 w-4" />
            Baixar
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <a
              href={buildIcsHref(booking)}
              download={`movepark-${booking.code}.ics`}
            >
              <CalendarIcon className="h-4 w-4" />
              Calendário
            </a>
          </Button>
        </div>
      </div>

      {/* Cabeçalho impresso */}
      <div className="hidden print:flex print:items-center print:justify-between print:border-b print:border-hairline print:pb-4">
        <Wordmark height={18} />
        <span className="text-caption text-muted">Voucher de reserva</span>
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
        <div className="text-caption text-muted">Código</div>
        <div className="text-display-md font-bold tracking-wide tabular-nums">
          {booking.code}
        </div>

        <div className="my-2">
          {qrUrl ? (
            <img
              src={qrUrl}
              width={240}
              height={240}
              alt={`QR ${booking.code}`}
              className="mx-auto"
            />
          ) : (
            <Skeleton className="h-60 w-60" />
          )}
        </div>

        <p className="text-body-sm text-muted">
          Apresente esse QR na chegada à vaga.
        </p>
      </div>

      <div className="mt-6 space-y-2 border-t border-hairline-soft pt-5 text-body-sm">
        <Row label="Operadora" value={booking.location.company.name} />
        <Row label="Localização" value={booking.location.name} />
        {booking.location.address && (
          <Row label="Endereço" value={booking.location.address} />
        )}
        <Row label="Tipo" value={booking.parking_type?.name ?? "Vaga"} />
        <Row label="Check-in" value={formatDateTime(booking.check_in_at)} />
        <Row label="Check-out" value={formatDateTime(booking.check_out_at)} />
        {booking.vehicle && (
          <Row
            label="Veículo"
            value={`${booking.vehicle.license_plate}${
              booking.vehicle.model ? ` · ${booking.vehicle.model}` : ""
            }`}
          />
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink">{value}</span>
    </div>
  );
}

function buildIcsHref(booking: MyBookingDetail): string {
  const dt = (s: string) =>
    new Date(s).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const summary = `Movepark — ${booking.location.name}`;
  const desc = `Reserva ${booking.code} · ${booking.location.company.name}`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Movepark//Booking//PT",
    "BEGIN:VEVENT",
    `UID:${booking.code}@movepark`,
    `DTSTART:${dt(booking.check_in_at)}`,
    `DTEND:${dt(booking.check_out_at)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${desc}`,
    `LOCATION:${booking.location.address ?? booking.location.name}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}
