import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, QrCode } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/auth/context";
import { formatDateTime, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useBookingByCode, useVoucherCheckIn, type VoucherBooking } from "@/features/voucher/api";
import { voucherValidity, type VoucherTone } from "@/features/voucher/voucher.logic";
import type { BookingStatus } from "@/types/domain";

const statusLabel: Record<BookingStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmada",
  checked_in: "Em uso",
  completed: "Concluída",
  cancelled: "Cancelada",
  no_show: "Não compareceu",
};

const toneBox: Record<VoucherTone, string> = {
  success: "border-success bg-badge-confirmed-bg text-badge-confirmed-fg",
  warning: "border-hairline bg-badge-pending-bg text-badge-pending-fg",
  error: "border-error bg-badge-cancelled-bg text-error",
  info: "border-hairline bg-surface-soft text-muted",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-10">
      <div className="flex items-center gap-2 text-ink">
        <QrCode className="h-5 w-5" />
        <h1 className="text-title-md">Validação de voucher</h1>
      </div>
      {children}
    </div>
  );
}

export default function VoucherValidatePage() {
  const [params] = useSearchParams();
  const code = params.get("code") ?? undefined;
  const { session, isLoading: authLoading, effectiveRole } = useAuth();

  if (authLoading) {
    return (
      <Shell>
        <Skeleton className="h-48 w-full" />
      </Shell>
    );
  }

  // Anônimo → entrar como operador
  if (!session || !effectiveRole) {
    const next = encodeURIComponent(`/voucher/validate${code ? `?code=${code}` : ""}`);
    return (
      <Shell>
        <p className="text-body-md text-muted">
          Entre com sua conta de operador para registrar a entrada.
        </p>
        <Button asChild>
          <Link to={`/login?next=${next}`}>Entrar como operador</Link>
        </Button>
      </Shell>
    );
  }

  // Cliente → não é a área dele
  if (effectiveRole === "customer") {
    return (
      <Shell>
        <p className="text-body-md text-muted">
          Esta página é para a equipe do estacionamento registrar sua entrada no portão.
        </p>
        <Button variant="secondary" asChild>
          <Link to={code ? `/bookings/${code}` : "/bookings"}>Ver minha reserva</Link>
        </Button>
      </Shell>
    );
  }

  // Operador / hub_admin
  return (
    <Shell>
      {code ? <OperatorValidate code={code} /> : <p className="text-body-md text-error">Código ausente na URL.</p>}
    </Shell>
  );
}

function OperatorValidate({ code }: { code: string }) {
  const { data: booking, isLoading } = useBookingByCode(code);
  const checkIn = useVoucherCheckIn(code);
  const validity = voucherValidity(booking ?? null, new Date());

  async function onCheckIn() {
    if (!booking) return;
    try {
      await checkIn.mutateAsync(booking.id);
      toast.success("Entrada registrada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar entrada");
    }
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="flex flex-col gap-5 rounded-md border border-hairline bg-canvas p-6">
      <div className="text-center">
        <div className="text-caption text-muted">Código</div>
        <div className="text-display-sm font-bold tracking-wide tabular-nums">{code}</div>
        {booking && (
          <span className="mt-2 inline-block rounded-sm bg-surface-soft px-2 py-0.5 text-caption text-muted">
            {statusLabel[booking.status]}
          </span>
        )}
      </div>

      <div className={cn("rounded-sm border p-3 text-body-sm", toneBox[validity.tone])} role="status">
        {validity.message}
        {validity.state === "checked_in" && booking?.checked_in_at && (
          <> Entrada às {formatTime(booking.checked_in_at)}.</>
        )}
      </div>

      {booking && <Summary booking={booking} />}

      {validity.canCheckIn && (
        <Button onClick={onCheckIn} disabled={checkIn.isPending}>
          <CheckCircle2 className="h-4 w-4" />
          {checkIn.isPending ? "Registrando…" : "Registrar entrada"}
        </Button>
      )}
    </div>
  );
}

function Summary({ booking }: { booking: VoucherBooking }) {
  return (
    <div className="space-y-2 border-t border-hairline-soft pt-4 text-body-sm">
      <Row label="Estacionamento" value={booking.location.company.name} />
      <Row label="Unidade" value={booking.location.name} />
      <Row label="Tipo" value={booking.parking_type_name ?? "Vaga"} />
      <Row label="Check-in" value={formatDateTime(booking.check_in_at)} />
      <Row label="Check-out" value={formatDateTime(booking.check_out_at)} />
      {booking.vehicle && (
        <Row
          label="Veículo"
          value={`${booking.vehicle.license_plate}${booking.vehicle.model ? ` · ${booking.vehicle.model}` : ""}`}
        />
      )}
      {booking.profile_name && <Row label="Cliente" value={booking.profile_name} />}
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
