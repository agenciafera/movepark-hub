import * as React from "react";
import { toast } from "sonner";
import { ArrowSquareOut, Calendar as CalendarIcon, CheckCircle, Download } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toDataUrl } from "@/lib/qr";
import { formatBRL, formatDate, formatTime, formatWeekdayDate } from "@/lib/format";
import { Wordmark } from "@/components/shared/Brand";
import { FARE_TIER_LABEL } from "@/lib/fares";
import { nightsOf } from "@/features/account/accountSummary.logic";
import { useVoucherPdf, type MyBookingDetail } from "./customerApi";
import { isVoucherReceipt } from "./voucher.logic";

type Props = {
  booking: MyBookingDetail;
};

/**
 * O voucher no formato de bilhete (design "Detalhe da Reserva"): cabeça navy com a
 * unidade, o corpo com os quatro dados que a portaria pede e, abaixo do recorte, o
 * QR e o código.
 *
 * O bilhete é autocontido de propósito: na impressão o resto da página é
 * `print:hidden`, então tudo o que precisa sair no papel mora aqui.
 */
export function Voucher({ booking }: Props) {
  const [qrUrl, setQrUrl] = React.useState<string | null>(null);
  const pdf = useVoucherPdf();
  // Estadia concluída: o documento deixa de servir para entrar e passa a servir para prestar contas.
  const receipt = isVoucherReceipt(booking.status);
  const noites = nightsOf(booking);
  const maps =
    booking.location_detail.latitude != null
      ? `https://www.google.com/maps?q=${booking.location_detail.latitude},${booking.location_detail.longitude}`
      : null;

  React.useEffect(() => {
    let active = true;
    const validateUrl = `${window.location.origin}/voucher/validate?code=${booking.code}`;
    // Guarda contra setState depois de desmontar: a geração do QR é assíncrona, e
    // sem isso ela resolvia após o teardown do teste ("window is not defined") e
    // faria um setState num componente que já saiu.
    toDataUrl(validateUrl, 240).then((url) => {
      if (active) setQrUrl(url);
    });
    return () => {
      active = false;
    };
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
    <div className="overflow-hidden rounded-lg bg-canvas print:rounded-none">
      {/* Cabeçalho impresso: no papel o navy não sai, então a marca entra em cima. */}
      <div className="hidden print:mb-4 print:flex print:items-center print:justify-between print:border-b print:border-hairline print:pb-4">
        <Wordmark height={18} />
        <span className="text-caption text-muted">
          {receipt ? "Comprovante de estadia" : "Voucher de reserva"}
        </span>
      </div>

      <div className="bg-mp-navy p-6 text-white print:bg-transparent print:p-0 print:text-ink">
        <div className="flex justify-end">
          <span className="text-badge uppercase tracking-[0.5px] text-white/60 print:text-muted">
            {receipt ? "Comprovante" : "Voucher"}
          </span>
        </div>
        <h3 className="mt-5 text-display-md leading-tight text-white print:text-ink">
          {booking.parking_type?.name ?? "Vaga"} · {booking.location.company.name}
        </h3>
        <p className="mt-2 text-caption-sm leading-relaxed text-white/75 print:text-muted">
          {booking.location.company.name === booking.location.name
            ? booking.location.address
            : [booking.location.name, booking.location.address].filter(Boolean).join(" · ")}
        </p>
        {maps && (
          <a
            href={maps}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex h-[38px] items-center gap-2 rounded-full bg-white/15 px-4 text-caption-sm font-semibold text-white no-underline transition-colors hover:bg-white/25 print:hidden"
          >
            <ArrowSquareOut className="h-4 w-4" aria-hidden />
            Como chegar
          </a>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-5 p-6">
        <TicketField label="Check-in" value={formatWeekdayDate(booking.check_in_at)}>
          {formatTime(booking.check_in_at)}
        </TicketField>
        <TicketField label="Check-out" value={formatWeekdayDate(booking.check_out_at)}>
          {formatTime(booking.check_out_at)}
        </TicketField>
        <div>
          <dt className="text-badge uppercase tracking-[0.4px] text-muted">Veículo</dt>
          <dd className="mt-2">
            {booking.vehicle ? (
              <>
                <span className="inline-flex h-6 items-center rounded-xs bg-mp-navy px-2 text-badge tracking-[0.6px] text-white">
                  {booking.vehicle.license_plate}
                </span>
                <span className="mt-1.5 block text-caption-sm text-muted">
                  {[booking.vehicle.model, booking.vehicle.color].filter(Boolean).join(" · ") ||
                    "Sem detalhes"}
                </span>
              </>
            ) : (
              <span className="text-caption-sm text-muted">Não informado</span>
            )}
          </dd>
        </div>
        <TicketField label="Permanência" value={`${noites} ${noites === 1 ? "diária" : "diárias"}`}>
          Tarifa {FARE_TIER_LABEL[booking.fare_tier]}
        </TicketField>
      </dl>

      {/* Recorte do bilhete. Os círculos vazam pras bordas e são pintados com a cor
          do fundo da página, então só funcionam sobre `bg-panel`. */}
      <div className="relative h-6 print:hidden" aria-hidden>
        <span className="bg-panel absolute -left-3 top-0 h-6 w-6 rounded-full" />
        <span className="bg-panel absolute -right-3 top-0 h-6 w-6 rounded-full" />
        <span className="absolute left-6 right-6 top-3 border-t-2 border-dashed border-surface-strong" />
      </div>

      <div className="flex flex-col items-center px-6 pb-6 pt-2 text-center">
        {/* O QR fica no comprovante também: ele aponta pra página de validação da
            reserva, que continua resolvendo depois do check-out. Deixa de abrir a
            cancela e passa a servir de consulta, que é pra isso que o comprovante existe. */}
        <div className="rounded-md p-3.5 ring-1 ring-inset ring-hairline">
          {qrUrl ? (
            <img
              src={qrUrl}
              width={176}
              height={176}
              alt={`QR ${booking.code}`}
              className="block"
            />
          ) : (
            <Skeleton className="h-44 w-44" />
          )}
        </div>

        <div className="mt-4 text-badge uppercase tracking-[0.5px] text-muted">
          Código da reserva
        </div>
        <div className="mt-1.5 text-display-xl tracking-[0.02em] tabular-nums text-ink">
          {booking.code}
        </div>

        {receipt ? (
          <Pill tone="ok">Estadia concluída em {formatDate(booking.check_out_at)}</Pill>
        ) : booking.status === "checked_in" && booking.checked_in_at ? (
          <Pill tone="ok">Entrada registrada às {formatTime(booking.checked_in_at)}</Pill>
        ) : booking.payment?.paid_at ? (
          <Pill tone="ok">Pagamento confirmado · {formatBRL(booking.total_amount)}</Pill>
        ) : (
          <p className="mt-3.5 text-caption-sm text-muted">Apresente esse QR na chegada à vaga.</p>
        )}

        <div className={cn("mt-5 grid w-full gap-2.5 print:hidden", !receipt && "grid-cols-2")}>
          <button
            type="button"
            onClick={downloadPdf}
            disabled={pdf.isPending}
            data-testid="voucher-download-pdf"
            className="flex h-11 items-center justify-center gap-2 rounded-md bg-mp-navy text-caption-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden />
            {pdf.isPending ? "Gerando…" : "Baixar PDF"}
          </button>
          {/* Estadia concluída não entra no calendário: o evento já passou. */}
          {!receipt && (
            <a
              href={buildIcsHref(booking)}
              download={`movepark-${booking.code}.ics`}
              className="flex h-11 items-center justify-center gap-2 rounded-md bg-surface-soft text-caption-sm font-semibold text-ink no-underline transition-colors hover:bg-mp-pale"
            >
              <CalendarIcon className="h-4 w-4" aria-hidden />
              Calendário
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function TicketField({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-badge uppercase tracking-[0.4px] text-muted">{label}</dt>
      <dd>
        <span className="mt-1.5 block text-title-md text-ink">{value}</span>
        <span className="mt-0.5 block text-caption-sm text-muted">{children}</span>
      </dd>
    </div>
  );
}

function Pill({ tone, children }: { tone: "ok"; children: React.ReactNode }) {
  return (
    <span className="mt-3.5 inline-flex items-center gap-2 rounded-full bg-surface-soft px-3.5 py-2 text-caption-sm font-semibold text-ink">
      <CheckCircle
        className={tone === "ok" ? "h-4 w-4 shrink-0 text-success" : "h-4 w-4 shrink-0"}
        aria-hidden
      />
      {children}
    </span>
  );
}

function buildIcsHref(booking: MyBookingDetail): string {
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
