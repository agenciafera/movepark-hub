import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Check, Download, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toDataUrl } from "@/lib/qr";
import { formatDateTime } from "@/lib/format";
import { useVoucherPdf } from "@/features/bookings/customerApi";
import type { BookingForCheckout } from "./api";

type Props = {
  booking: BookingForCheckout;
};

export function Step4Confirmation({ booking }: Props) {
  const [qrUrl, setQrUrl] = React.useState<string | null>(null);
  const pdf = useVoucherPdf();

  React.useEffect(() => {
    const validateUrl = `${window.location.origin}/voucher/validate?code=${booking.code}`;
    toDataUrl(validateUrl, 240).then(setQrUrl);
  }, [booking.code]);

  async function downloadPdf() {
    try {
      const { url } = await pdf.mutateAsync(booking.code);
      window.open(url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao baixar o voucher");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-success text-white">
          <Check className="h-7 w-7" />
        </span>
        <h2 className="text-display-xl text-ink">Reserva confirmada!</h2>
        <p className="text-body-md text-muted">
          Mostre o QR Code ou informe o código na entrada do estacionamento.
        </p>
      </div>

      <div className="rounded-md border border-hairline bg-canvas p-6 text-center">
        <div className="text-caption text-muted">Código</div>
        <div className="text-display-xl tabular-nums">
          {booking.code}
        </div>

        <div className="mt-5 flex justify-center">
          {qrUrl ? (
            <img src={qrUrl} width={240} height={240} alt={`QR ${booking.code}`} />
          ) : (
            <Skeleton className="h-60 w-60" />
          )}
        </div>

        <p className="mt-4 text-body-sm text-muted">
          Apresente esse QR na chegada à vaga.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={downloadPdf}
            disabled={pdf.isPending}
          >
            <Download className="h-4 w-4" />
            {pdf.isPending ? "Gerando…" : "Baixar voucher PDF"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            asChild
          >
            <a
              href={buildIcsHref(booking)}
              download={`movepark-${booking.code}.ics`}
            >
              <CalendarIcon className="h-4 w-4" />
              Adicionar ao calendário
            </a>
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-hairline-soft bg-surface-soft p-5 text-body-sm text-body">
        <ol className="space-y-2">
          <li>1. Apresente o QR na entrada do estacionamento.</li>
          <li>2. Siga as orientações da equipe do estacionamento.</li>
          <li>
            3. Check-in:{" "}
            <strong className="text-ink">
              {formatDateTime(booking.check_in_at)}
            </strong>
            .
          </li>
        </ol>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link to="/bookings">Ir pras minhas reservas</Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link to="/">Voltar pra home</Link>
        </Button>
      </div>
    </div>
  );
}

function buildIcsHref(booking: BookingForCheckout): string {
  const dt = (s: string) =>
    new Date(s).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const summary = `Movepark · ${booking.location.name}`;
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
