import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/auth/context";
import type { BookingStatus } from "@/types/domain";
import { useBookingByCode, useCancelBookingStaff, useReconcileBookingFees, useUpdateBookingStatus } from "./api";
import { FlightCheckoutDialog } from "./FlightCheckoutDialog";
import { awaitingRealCheckout, flightNotice, type OperatorExtension } from "./flightCheckout.logic";
import { usePayoutReleaseDays } from "@/features/payouts/api";
import { useChangeBookingVehicle } from "./customerApi";
import { BookingMoneyCard } from "./BookingMoneyCard";
import { GatewayTrail } from "./GatewayTrail";
import { BookingCommissionCard } from "@/features/commission/BookingCommissionCard";
import { SupportTicketsCard } from "@/features/support/SupportTicketsCard";
import { FlightProtectionDialog } from "./FlightProtectionDialog";
import { bookingCustomerName } from "./bookings.logic";
import { buildMoneyBreakdown, mainPayment, type MoneyPaymentLike, type PriceBreakdownLike } from "./bookingMoney.logic";
import { paymentBadge, paymentState, refundWindow } from "./payment.logic";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import { documentMask } from "@/lib/masks";
import { parkingTitle } from "@/lib/parkingName";

const PLANO: Record<string, string> = { basica: "Básica", flex: "Flex", superflex: "Superflex" };

/** O que a operação pode fazer em cada status (o servidor é quem manda; aqui é só o que oferecer). */
const OPERACAO: Record<BookingStatus, BookingStatus[]> = {
  pending: ["confirmed"],
  confirmed: ["checked_in", "no_show"],
  checked_in: ["completed"],
  completed: [],
  cancelled: [],
  expired: [],
  no_show: [],
};

function Campo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-caption text-muted">{label}</div>
      <div className="text-body-sm text-ink">{value}</div>
    </div>
  );
}

/**
 * A tela da reserva (18/09/2026), a mesma para Manager e Operator. Substitui o popup do Manager
 * e a ficha lateral do Operator: os dois status (o da reserva e o do dinheiro), os valores
 * destrinchados, a linha do tempo e as ações. O que muda por audiência: o Manager vê a coluna da
 * Movepark e o rastro do gateway; o Operator vê a parte dele e as ações de operação (confirmar,
 * check-in, check-out, não compareceu, trocar placa).
 */
export function BookingDetailView({ code, audience }: { code: string | undefined; audience: "manager" | "operator" }) {
  const { hasScope, effectiveRole } = useAuth();
  const bookingQ = useBookingByCode(code);
  const booking = bookingQ.data ?? null;
  const cancelMutation = useCancelBookingStaff();
  const statusMutation = useUpdateBookingStatus();
  const changeVehicle = useChangeBookingVehicle();
  const [confirming, setConfirming] = React.useState(false);
  const [plate, setPlate] = React.useState("");
  const [flightOpen, setFlightOpen] = React.useState(false);
  const [flightCheckoutOpen, setFlightCheckoutOpen] = React.useState(false);
  const reconcileFees = useReconcileBookingFees();
  const releaseDaysQ = usePayoutReleaseDays(bookingQ.data?.location?.company?.id);
  const releaseDays = releaseDaysQ.data ?? null;

  // Taxa do gateway sob demanda (22/09/2026): quando o Manager abre uma reserva paga cuja taxa
  // ainda não foi apurada, pede à Edge na hora, em vez de esperar até 30 min pelo cron. Uma vez
  // por reserva aberta; se o recebível ainda não existir, a próxima abertura tenta de novo.
  const pendingFeeId = React.useMemo(() => {
    const b = bookingQ.data;
    if (!b || effectiveRole !== "hub_admin") return null;
    const pago = (b.payments ?? []).find(
      (p) => (p.status === "paid" || p.status === "refunded") && (p as { gateway_fee_cents?: number | null }).gateway_fee_cents == null,
    );
    return pago ? b.id : null;
  }, [bookingQ.data, effectiveRole]);
  const askedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!pendingFeeId || askedRef.current === pendingFeeId) return;
    askedRef.current = pendingFeeId;
    reconcileFees.mutate(pendingFeeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFeeId]);

  const base = audience === "manager" ? "/manager" : "/operator";
  const back = { to: `${base}/bookings`, label: "Voltar para Reservas" };

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
  const ext = (booking.fare_extensions?.[0] ?? null) as OperatorExtension | null;
  const aguardaSaidaReal = awaitingRealCheckout(ext);
  const dinheiro = paymentBadge(booking.payments, booking.status);
  const janela = pay.canRefund ? refundWindow(booking.payments) : null;
  const podeCancelarStatus = booking.status === "pending" || booking.status === "confirmed";
  // No Manager a UI espelha o escopo; no Operator o servidor é a barreira (a ficha antiga também
  // oferecia sem checar), e o dono do estacionamento cancela as próprias reservas.
  const canCancel = podeCancelarStatus && (audience === "operator" || hasScope("bookings:cancel", booking.location?.company?.id));
  const refundHint = pay.canRefund ? `estorna ${formatBRL(booking.total_amount)} ao cliente` : pay.badge === "Estornado" ? "o valor já foi estornado" : null;
  const operacoes = audience === "operator" ? OPERACAO[booking.status] : [];
  const busy = statusMutation.isPending || cancelMutation.isPending;

  const pagamento = mainPayment((booking.payments ?? []) as unknown as (MoneyPaymentLike & { created_at: string })[]);
  const money = buildMoneyBreakdown(
    (booking as unknown as { price_breakdown?: PriceBreakdownLike | null }).price_breakdown ?? null,
    Number(booking.total_amount),
    pagamento ? { ...pagamento, amount: Number(pagamento.amount), debt_recovered_cents: pagamento.debt_recovered_cents ?? 0, refund_partner_cents: pagamento.refund_partner_cents ?? 0 } : null,
    releaseDays,
  );
  const fareTier = (booking as unknown as { fare_tier?: string | null }).fare_tier ?? null;
  const fareCancelUntil = (booking as unknown as { fare_cancel_until?: string | null }).fare_cancel_until ?? null;

  function transition(status: BookingStatus, label: string) {
    const patch: Parameters<typeof statusMutation.mutate>[0] = { bookingId: booking!.id, status };
    if (status === "checked_in") patch.timestamp = { field: "checked_in_at", value: new Date().toISOString() };
    if (status === "completed") patch.timestamp = { field: "checked_out_at", value: new Date().toISOString() };
    statusMutation.mutate(patch, {
      onSuccess: () => toast.success(`${label} com sucesso`),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao atualizar"),
    });
  }

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

  function handleCancel() {
    cancelMutation.mutate(booking!.code, {
      onSuccess: (r) => {
        toast.success(
          r.refunded
            ? r.refund_pending
              ? "Reserva cancelada. Estorno em processamento."
              : "Reserva cancelada e valor estornado."
            : r.refund_manual
              ? "Reserva cancelada. O gateway recusou o estorno: a devolução está com a equipe da Movepark."
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
          {audience === "manager" ? (
            <>
              O gateway recusou o estorno; o cliente ainda não recebeu.{" "}
              <Link to="/manager/finance/payouts" className="underline underline-offset-2">
                Tentar de novo ou marcar como devolvido
              </Link>
            </>
          ) : (
            "A devolução ao cliente está pendente com a equipe da Movepark. Você não precisa fazer nada."
          )}
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
            <Campo label="Veículo" value={[booking.vehicle?.license_plate, booking.vehicle?.model, booking.vehicle?.color].filter(Boolean).join(" · ") || "-"} />
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

      <BookingMoneyCard money={money} audience={audience} />

      {/* De onde a venda veio e que comissão ela paga (E0.3.12). */}
      <BookingCommissionCard
        booking={booking}
        companyId={booking.location?.company?.id}
        payments={booking.payments}
        audience={audience}
        canFix={effectiveRole === "hub_admin"}
      />

      {/* Proteção de voo acionada (25/09/2026): a portaria precisa saber até quando sai sem custo. */}
      {ext && aguardaSaidaReal && (
        <div className="rounded-md border border-warning/40 bg-badge-pending-bg p-4 text-body-sm text-ink" data-testid="flight-notice">
          {flightNotice(ext, formatDateTime)}
        </div>
      )}
      {ext && (
        <FlightCheckoutDialog bookingId={booking.id} extension={ext} open={flightCheckoutOpen} onOpenChange={setFlightCheckoutOpen} />
      )}

      {/* Chamados do cliente (25/09/2026): só a Movepark atende; o estacionamento não vê. */}
      {audience === "manager" && <SupportTicketsCard bookingId={booking.id} canClose={effectiveRole === "hub_admin"} />}

      {(operacoes.length > 0 || (audience === "operator" && ["pending", "confirmed", "checked_in"].includes(booking.status))) && (
        <Card>
          <CardHeader>
            <CardTitle>Operação</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {operacoes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {operacoes.includes("confirmed") && (
                  <Button size="sm" disabled={busy} onClick={() => transition("confirmed", "Reserva confirmada")}>
                    Confirmar
                  </Button>
                )}
                {operacoes.includes("checked_in") && (
                  <Button size="sm" disabled={busy} onClick={() => transition("checked_in", "Check-in registrado")}>
                    Check-in
                  </Button>
                )}
                {operacoes.includes("completed") && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => (aguardaSaidaReal ? setFlightCheckoutOpen(true) : transition("completed", "Check-out registrado"))}
                  >
                    Check-out
                  </Button>
                )}
                {operacoes.includes("no_show") && (
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => transition("no_show", "Reserva marcada como não comparecimento")}>
                    Não compareceu
                  </Button>
                )}
              </div>
            )}
            <div className="flex max-w-md items-center gap-2">
              <Input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="Nova placa" className="h-9 flex-1 uppercase" aria-label="Nova placa" />
              <Button size="sm" variant="secondary" onClick={savePlate} disabled={!plate.trim() || changeVehicle.isPending}>
                Trocar placa
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Proteção de voo (Superflex): o staff aciona pelo cliente que ligou do aeroporto. */}
      {(booking as unknown as { fare_benefits?: { flight_delay_protection?: boolean } | null }).fare_benefits?.flight_delay_protection === true &&
        ["confirmed", "checked_in"].includes(booking.status) && (
          <Card>
            <CardHeader>
              <CardTitle>Proteção de voo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-body-sm text-muted">
                Superflex: atraso ou cancelamento do voo, a saída é estendida em até 24h, uma vez, por conta
                da Movepark. O que passar disso o estacionamento cobra no balcão.
              </p>
              {ext && (
                <dl className="grid grid-cols-3 gap-3" data-testid="flight-money">
                  <div><dt className="text-caption text-muted">Crédito ao parceiro (24h)</dt><dd className="text-body-sm text-ink">{formatBRL((ext.partner_credit_cents ?? 0) / 100)}</dd></div>
                  <div><dt className="text-caption text-muted">Excedente previsto</dt><dd className="text-body-sm text-ink">{formatBRL(ext.overage_cents / 100)}</dd></div>
                  <div><dt className="text-caption text-muted">Cobrado no balcão</dt><dd className="text-body-sm text-ink">{ext.overage_charged_cents == null ? "ainda não registrado" : formatBRL(ext.overage_charged_cents / 100)}</dd></div>
                </dl>
              )}
              <div>
                {!ext && (
                  <Button size="sm" variant="secondary" onClick={() => setFlightOpen(true)}>
                    Acionar proteção de voo
                  </Button>
                )}
              </div>
              <FlightProtectionDialog
                bookingCode={booking.code}
                currentCheckOut={booking.check_out_at}
                flightNumber={(booking as unknown as { flight_number?: string | null }).flight_number ?? null}
                open={flightOpen}
                onOpenChange={setFlightOpen}
              />
            </CardContent>
          </Card>
        )}

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

      {audience === "manager" && effectiveRole === "hub_admin" && (
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
