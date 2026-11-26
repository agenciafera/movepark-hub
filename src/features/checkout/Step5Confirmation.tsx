import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Calendar as CalendarIcon, Check, Download, QrCode } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toDataUrl } from "@/lib/qr";
import { formatDateTime } from "@/lib/format";
import { parkingTitle } from "@/lib/parkingName";
import { useBookingAccessCode, useVoucherPdf } from "@/features/bookings/customerApi";
import { voucherQrContent } from "@/features/bookings/voucher.logic";
import { OperatedBy } from "@/components/shared/OperatedBy";
import type { BookingForCheckout } from "./api";

type Props = {
  booking: BookingForCheckout;
};

/**
 * Confirmação do checkout. Na reunião de 26/11/2026, quem acabou de pagar no PIX via o QR do PIX sumir
 * e outro QR, do mesmo tamanho, aparecer no lugar, e achava que tinha de pagar de novo. O QR de entrada
 * só serve na portaria, no dia: aqui ele fica recolhido, e o que aparece é que o pagamento entrou e
 * os botões do que a pessoa faz agora (ver a reserva, baixar o voucher, pôr na agenda).
 */
export function Step5Confirmation({ booking }: Props) {
  const [qrUrl, setQrUrl] = React.useState<string | null>(null);
  const [mostrarQr, setMostrarQr] = React.useState(false);
  const pdf = useVoucherPdf();
  // Unidade com cancela integrada (Cloudpark): o QR é o código do provedor, que pode levar alguns
  // segundos para chegar depois do pagamento. Enquanto isso, o QR fica em carregamento.
  const access = useBookingAccessCode(booking.code);
  const accessCode = access.data?.code ?? null;
  const waitingAccess = access.isLoading || Boolean(access.data?.pending);

  React.useEffect(() => {
    if (waitingAccess) return;
    let active = true;
    toDataUrl(voucherQrContent(window.location.origin, booking.code, accessCode), 240).then((url) => {
      if (active) setQrUrl(url);
    });
    return () => {
      active = false;
    };
  }, [booking.code, accessCode, waitingAccess]);

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
        <p className="text-pretty text-body-md text-muted" data-testid="confirmacao-pagamento">
          Pagamento recebido. Não falta pagar nada: sua vaga está garantida.
        </p>
      </div>

      <div className="rounded-md border border-hairline bg-canvas p-6 text-center">
        <div className="text-caption text-muted">Código</div>
        <div className="text-display-xl tabular-nums">
          {booking.code}
        </div>

        <p className="mt-2 text-body-sm text-muted">
          Na entrada, mostre o QR da reserva ou diga este código.
        </p>
        <OperatedBy
          logo={booking.location.logo}
          name={booking.location.company.name}
          className="mt-3 justify-center"
        />

        <div className="mt-6 flex flex-col gap-2 tablet:flex-row tablet:flex-wrap tablet:justify-center">
          <Button asChild>
            <Link to={`/bookings/${booking.code}`}>Ver minha reserva</Link>
          </Button>
          <Button
            variant="secondary"
            onClick={downloadPdf}
            disabled={pdf.isPending}
            data-testid="voucher-download-pdf-step4"
          >
            <Download className="h-4 w-4" />
            {pdf.isPending ? "Gerando…" : "Baixar voucher PDF"}
          </Button>
          <Button variant="secondary" asChild>
            <a
              href={buildIcsHref(booking)}
              download={`movepark-${booking.code}.ics`}
            >
              <CalendarIcon className="h-4 w-4" />
              Adicionar ao calendário
            </a>
          </Button>
        </div>
        {/* O QR de entrada fica recolhido: ele só serve na portaria e fica salvo na reserva. */}
        <div className="mt-6 border-t border-hairline pt-5">
          {mostrarQr ? (
            <div className="flex flex-col items-center gap-3" data-testid="qr-entrada">
              <p className="text-body-sm font-semibold text-ink">QR de entrada na portaria</p>
              {qrUrl ? (
                <img src={qrUrl} width={240} height={240} alt={`QR de entrada da reserva ${booking.code}`} />
              ) : (
                <Skeleton className="h-60 w-60" />
              )}
              <p className="text-pretty text-caption-sm text-muted">
                Ele também fica salvo em Minhas reservas, para mostrar no dia.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setMostrarQr(true)}
              className="inline-flex items-center gap-2 text-body-sm font-semibold text-mp-indigo hover:underline"
            >
              <QrCode className="h-4 w-4" aria-hidden />
              Mostrar o QR de entrada
            </button>
          )}
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
        <Button variant="secondary" asChild>
          <Link to="/bookings">Minhas reservas</Link>
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
  const desc = `Reserva ${booking.code} · ${parkingTitle(booking.location.company.name, booking.location.name)}`;
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
