import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/auth/context";
import { useBookingByCode, useBookingGatewayTrail, useCancelBookingStaff } from "@/features/bookings/api";
import { BookingMoneyCard } from "@/features/bookings/BookingMoneyCard";
import { GatewayTrail } from "@/features/bookings/GatewayTrail";
import { bookingCustomerName } from "@/features/bookings/bookings.logic";
import { buildMoneyBreakdown, mainPayment, type PriceBreakdownLike } from "@/features/bookings/bookingMoney.logic";
import { paymentBadge, paymentState, refundWindow } from "@/features/bookings/payment.logic";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import { documentMask } from "@/lib/masks";
import { parkingTitle } from "@/lib/parkingName";

const PLANO: Record<string, string> = { basica: "Básica", flex: "Flex", superflex: "Superflex" };

function Campo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-caption text-muted">{label}</div>
      <div className="text-body-sm text-ink">{value}</div>
    </div>
  );
}

/**
 * Manager › Reservas › <código> (18/09/2026). Substitui o popup: a reserva com os dois status
 * (o dela e o do dinheiro), os valores destrinchados, a linha do tempo, o rastro do gateway e o
 * cancelamento. Página, e não modal, porque passou a ter conteúdo demais para uma caixa.
 */
export default function ManagerBookingDetail() {
  const { code } = useParams<{ code: string }>();
  const { hasScope, effectiveRole } = useAuth();
  const bookingQ = useBookingByCode(code);
  const booking = bookingQ.data ?? null;
  const trail = useBookingGatewayTrail(booking?.id, effectiveRole === "hub_admin");
  const cancelMutation = useCancelBookingStaff();
  const [confirming, setConfirming] = React.useState(false);

  const back = { to: "/manager/bookings", label: "Voltar para Reservas" };

  if (bookingQ.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={`Reserva ${code ?? ""}`} back={back} />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!booking) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Reserva não encontrada" back={back} />
        <EmptyState title="Não achamos essa reserva" description="Confira o código ou abra pela lista de Reservas." />
      </div>
    );
  }

  const pay = paymentState(booking.payments);
  const dinheiro = paymentBadge(booking.payments, booking.status);
  const janela = pay.canRefund ? refundWindow(booking.payments) : null;
  const canCancel =
    (booking.status === "pending" || booking.status === "confirmed") &&
    hasScope("bookings:cancel", booking.location?.company?.id);
  const refundHint = pay.canRefund ? `estorna ${formatBRL(booking.total_amount)} ao cliente` : pay.badge === "Estornado" ? "o valor já foi estornado" : null;

  // Valores: o que foi vendido vem da reserva; a divisão, a taxa e o estorno vêm do pagamento do
  // rastro do gateway (só hub_admin lê). Sem o rastro, mostra só o lado do cliente.
  const trailPayment = mainPayment(trail.data?.payments ?? []);
  const money = buildMoneyBreakdown(
    (booking as unknown as { price_breakdown?: PriceBreakdownLike | null }).price_breakdown ?? null,
    Number(booking.total_amount),
    trailPayment ? { ...trailPayment, amount: Number(trailPayment.amount) } : null,
  );
  const fareTier = (booking as unknown as { fare_tier?: string | null }).fare_tier ?? null;
  const fareCancelUntil = (booking as unknown as { fare_cancel_until?: string | null }).fare_cancel_until ?? null;

  function handleCancel() {
    cancelMutation.mutate(booking!.code, {
      onSuccess: (r) => {
        toast.success(
          r.refunded
            ? r.refund_pending
              ? "Reserva cancelada. Estorno em processamento."
              : "Reserva cancelada e valor estornado."
            : r.refund_manual
              ? "Reserva cancelada. O gateway recusou o estorno: a devolução está na fila manual."
              : "Reserva cancelada.",
        );
        setConfirming(false);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao cancelar"),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Reserva ${booking.code}`}
        description={parkingTitle(booking.location?.company?.name, booking.location?.name)}
        back={back}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={booking.status} />
            {dinheiro && (
              <Badge tone={dinheiro.tone} data-testid="badge-pagamento">
                {dinheiro.label}
              </Badge>
            )}
          </div>
        }
      />

      {dinheiro?.manualRefund && (
        <div role="alert" className="rounded-md border border-error/40 bg-error/5 p-3 text-body-sm text-error" data-testid="aviso-devolucao-pendente">
          O gateway recusou o estorno; o cliente ainda não recebeu.{" "}
          <Link to="/manager/finance/payouts" className="underline underline-offset-2">
            Tentar de novo ou marcar como devolvido
          </Link>
        </div>
      )}

      <div className="grid gap-6 desktop:grid-cols-3">
        <Card className="desktop:col-span-2">
          <CardHeader>
            <CardTitle>Reserva</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 tablet:grid-cols-3">
            <Campo label="Cliente" value={bookingCustomerName(booking) ?? "-"} />
            <Campo label="Telefone" value={booking.customer_phone ?? "-"} />
            <Campo label="E-mail" value={booking.customer_email ?? "-"} />
            <Campo label="CPF/CNPJ" value={booking.customer_tax_id ? documentMask(booking.customer_tax_id) : booking.profile?.tax_id ? documentMask(booking.profile.tax_id) : "-"} />
            <Campo label="Veículo" value={[booking.vehicle?.license_plate, booking.vehicle?.model].filter(Boolean).join(" · ") || "-"} />
            <Campo label="Plano" value={fareTier ? `${PLANO[fareTier] ?? fareTier}${fareCancelUntil ? ` · cancela grátis até ${formatDateTime(fareCancelUntil)}` : ""}` : "-"} />
            <Campo label="Check-in" value={formatDateTime(booking.check_in_at)} />
            <Campo label="Check-out" value={formatDateTime(booking.check_out_at)} />
            <Campo label="Valor total" value={formatBRL(booking.total_amount)} />
            {booking.notes && <Campo label="Notas" value={booking.notes} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Linha do tempo</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1 text-body-sm">
              <li className="text-muted">Criada em {formatDateTime(booking.created_at)}</li>
              {booking.checked_in_at && <li className="text-muted">Check-in em {formatDateTime(booking.checked_in_at)}</li>}
              {booking.checked_out_at && <li className="text-muted">Check-out em {formatDateTime(booking.checked_out_at)}</li>}
              {booking.status === "cancelled" && <li className="text-error">Cancelada em {formatDateTime(booking.updated_at)}</li>}
            </ol>
          </CardContent>
        </Card>
      </div>

      <BookingMoneyCard money={money} />

      {canCancel && (
        <Card>
          <CardHeader>
            <CardTitle>Cancelar</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {janela && (janela.expired || janela.daysLeft <= 7) && (
              <div
                className={`rounded-md border p-3 text-body-sm ${janela.expired ? "border-error/40 bg-error/5 text-error" : "border-warning/40 bg-warning/5 text-ink"}`}
                data-testid="aviso-janela-estorno"
              >
                {janela.expired
                  ? `O prazo de estorno pelo gateway venceu em ${formatDate(janela.deadline)} (${janela.method === "pix" ? "PIX: 90 dias" : "cartão: 180 dias"} depois do pagamento). Cancelar ainda funciona, mas a devolução ao cliente vai para a fila de reembolso manual, para pagar por fora.`
                  : `O prazo de estorno pelo gateway vence em ${formatDate(janela.deadline)} (${janela.daysLeft} dia${janela.daysLeft === 1 ? "" : "s"}). Depois disso a devolução vai para a fila manual.`}
              </div>
            )}
            {!confirming ? (
              <div>
                <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
                  Cancelar reserva
                </Button>
              </div>
            ) : (
              <div className="space-y-2 rounded-md border border-hairline bg-surface-soft p-3">
                <p className="text-body-sm text-ink">
                  Cancela a reserva{refundHint ? ` e ${refundHint}` : ""}. Só é possível antes do check-in. Confirmar?
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setConfirming(false)} disabled={cancelMutation.isPending}>
                    Voltar
                  </Button>
                  <Button variant="danger" size="sm" onClick={handleCancel} disabled={cancelMutation.isPending}>
                    {cancelMutation.isPending ? "Cancelando…" : "Confirmar cancelamento"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {effectiveRole === "hub_admin" && (
        <Card>
          <CardHeader>
            <CardTitle>Gateway (Pagar.me)</CardTitle>
          </CardHeader>
          <CardContent>
            <GatewayTrail bookingId={booking.id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
