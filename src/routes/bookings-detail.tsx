import * as React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Envelope, Phone, ShieldCheck, Tray } from "@phosphor-icons/react";
import { BOOKING_STATUS_LABELS } from "@/components/shared/StatusBadge";
import {
  BOOKING_STATUS_TONES,
  BOOKING_TONE_SURFACE,
} from "@/components/shared/statusBadge.logic";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { Voucher } from "@/features/bookings/Voucher";
import { canDownloadVoucher } from "@/features/bookings/voucher.logic";
import { CancelBookingDialog } from "@/features/bookings/CancelBookingDialog";
import { customerSelfCancel } from "@/features/bookings/cancellation.logic";
import {
  canCustomerChangeDates,
  canCustomerChangePaidDates,
  canCustomerChangeVehicle,
} from "@/features/bookings/booking-modifications.logic";
import { UpgradeActionHint } from "@/features/bookings/UpgradeActionHint";
import { FareUpgradeDialog } from "@/features/fares/FareUpgradeDialog";
import { ChangeVehicleDialog } from "@/features/bookings/ChangeVehicleDialog";
import { ChangeDatesDialog } from "@/features/bookings/ChangeDatesDialog";
import { ChangeDatesPaidDialog } from "@/features/bookings/ChangeDatesPaidDialog";
import { useBookingDetail } from "@/features/bookings/customerApi";
import { useAuth } from "@/auth/context";
import { guaranteeChannel } from "@/features/guarantee/whatsapp";
import { useMyReview } from "@/features/reviews/api";
import { ReviewForm } from "@/features/reviews/ReviewForm";
import { RatingStars } from "@/features/reviews/RatingStars";
import { formatBRL, formatDate } from "@/lib/format";
import { FARE_BENEFIT_LABELS, FARE_TIER_LABEL, fareReais } from "@/lib/fares";
import {
  detailHeadline,
  entrySteps,
  freeCancelNote,
  statusPillDetail,
} from "@/features/bookings/bookingDetail.logic";
import { cn } from "@/lib/utils";

export default function BookingDetailPage({ backTo = "/bookings" }: { backTo?: string }) {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { data: booking, isLoading, error } = useBookingDetail(code);
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [vehicleOpen, setVehicleOpen] = React.useState(false);
  const [datesOpen, setDatesOpen] = React.useState(false);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const myReview = useMyReview(booking?.status === "completed" ? booking?.id : undefined);

  // Deep link de 1 clique do e-mail de coleta (?rating=N) → abre o form com a nota.
  const deepRating = Number(searchParams.get("rating")) || 0;
  const [autoOpened, setAutoOpened] = React.useState(false);
  React.useEffect(() => {
    if (
      !autoOpened &&
      deepRating >= 1 &&
      deepRating <= 5 &&
      booking?.status === "completed" &&
      !myReview.isLoading &&
      !myReview.data
    ) {
      setReviewOpen(true);
      setAutoOpened(true);
    }
  }, [autoOpened, deepRating, booking?.status, myReview.isLoading, myReview.data]);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-8 desktop:px-8">
        <Skeleton className="mb-6 h-10 w-1/2" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-8 desktop:px-8">
        <div className="rounded-md border border-error bg-badge-cancelled-bg p-4 text-body-sm text-error">
          {(error as Error).message}
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-8 desktop:px-8">
        <EmptyState
          icon={<Tray className="h-10 w-10" />}
          title="Reserva não encontrada"
          description="Verifique o código e tente de novo."
          action={
            <Button asChild>
              <Link to={backTo}>Minhas reservas</Link>
            </Button>
          }
        />
      </div>
    );
  }

  // A lista vive em voucher.logic e espelha a da Edge: incluir `completed` é o que faz a reserva
  // concluída poder baixar o comprovante (86ajmy4d2).
  const canSeeVoucher = canDownloadVoucher(booking.status);
  // Auto-cancelamento do cliente é gateado pela janela da Tarifa (E2.8). Fora da janela, confirmado
  // e pago, o cliente é bloqueado (só staff cancela). Ver docs/specs/booking-modifications.md.
  const selfCancel = customerSelfCancel(
    booking.status,
    booking.check_in_at,
    new Date(),
    booking.fare_cancel_until,
  );
  const cancelBlocked = !selfCancel.allowed && selfCancel.reason === "window_closed";
  const now = new Date();
  const canChangeDates = canCustomerChangeDates(
    booking.fare_benefits,
    booking.status,
    booking.check_in_at,
    now,
  );
  // Reserva paga: alterar datas passa pelo fluxo com cobrança/estorno da diferença (E2.8-h).
  const canChangePaidDates = canCustomerChangePaidDates(
    booking.fare_benefits,
    booking.status,
    booking.check_in_at,
    now,
  );
  const canChangeVehicle = canCustomerChangeVehicle(
    booking.fare_benefits,
    booking.status,
    booking.check_in_at,
    now,
  );
  // Upgrade de Tarifa possível: antes da entrada, não-Superflex, reserva ativa. Também gate dos
  // convites de upgrade por ação (E2.8-j) quando a Básica não inclui a troca.
  const canUpgrade =
    booking.fare_tier !== "superflex" &&
    ["pending", "confirmed"].includes(booking.status) &&
    new Date(booking.check_in_at) > now;
  const canContinuePayment = booking.status === "pending";

  const headline = detailHeadline(booking.status);
  const pill = statusPillDetail(booking.status, booking.check_in_at);
  const passos = entrySteps({
    status: booking.status,
    checkOutAt: booking.check_out_at,
    toleranceMinutes: booking.location_detail.tolerance_minutes,
  });
  const cancelNote = freeCancelNote(booking.fare_cancel_until);
  const beneficios = FARE_BENEFIT_LABELS.filter((b) => booking.fare_benefits?.[b.key] === true);
  const temAcao = canChangeDates || canChangePaidDates || canChangeVehicle || selfCancel.allowed;
  const guarantee = guaranteeChannel({
    unitPhone: booking.location_detail.phone,
    code: booking.code,
    unitName: booking.location.name,
  });

  return (
    <div className="bg-panel">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-8 desktop:px-8">
        <header className="flex flex-wrap items-end justify-between gap-5 print:hidden">
          <div className="min-w-0">
            <Link
              to={backTo}
              className="inline-flex items-center gap-2 text-caption-sm font-semibold text-muted no-underline hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Minhas reservas
            </Link>
            <h1 className="mt-2.5 text-display-xl text-ink">{headline.title}</h1>
            <p className="mt-2 text-body-md text-muted">{headline.subtitle}</p>
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-badge",
              BOOKING_TONE_SURFACE[BOOKING_STATUS_TONES[booking.status]],
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
            {BOOKING_STATUS_LABELS[booking.status]}
            {pill ? ` · ${pill}` : ""}
          </span>
        </header>

        <div className="mt-5 flex flex-wrap items-start gap-5">
          {/* Bilhete: no desktop fica à direita e gruda; no mobile sobe pro topo, que
              é o que a pessoa abre no aeroporto. */}
          <aside className="order-first w-full shrink-0 desktop:order-2 desktop:sticky desktop:top-8 desktop:w-[372px]">
            {canSeeVoucher ? (
              <Voucher booking={booking} />
            ) : booking.status === "pending" ? (
              <div className="rounded-lg border border-warning bg-badge-pending-bg p-5 text-body-sm text-warning">
                <strong>Pagamento pendente.</strong> Finalize o pagamento pra receber seu voucher.
              </div>
            ) : (
              <div className="rounded-lg bg-canvas p-5 text-body-sm text-muted">
                Esta reserva ({BOOKING_STATUS_LABELS[booking.status].toLowerCase()}) não tem voucher
                disponível.
              </div>
            )}
          </aside>

          <main className="flex min-w-[320px] flex-1 flex-col gap-5 print:hidden">
            {canSeeVoucher && (
              <section className="rounded-lg bg-canvas p-6 desktop:p-7">
                <h2 className="text-title-md text-ink">Como será sua entrada</h2>
                <ol className="mt-5">
                  {passos.map((passo, i) => (
                    <li key={passo.n} className="flex gap-3.5">
                      <div className="flex shrink-0 flex-col items-center">
                        <span
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-full text-badge",
                            passo.state === "next"
                              ? "bg-surface-soft text-muted"
                              : "bg-mp-primary text-white",
                          )}
                        >
                          {passo.n}
                        </span>
                        {i < passos.length - 1 && (
                          <span className="my-1 w-0.5 flex-1 bg-surface-strong" aria-hidden />
                        )}
                      </div>
                      <div className="min-w-0 pb-5">
                        <p className="text-body-sm font-semibold leading-snug text-ink">
                          {passo.title}
                        </p>
                        <p className="mt-1 text-caption-sm leading-relaxed text-muted">
                          {passo.text}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <section className="rounded-lg bg-canvas p-6 desktop:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-title-md text-ink">Pagamento</h2>
                {booking.payment?.paid_at && (
                  <span className="whitespace-nowrap text-caption-sm font-semibold text-success">
                    Confirmado em {formatDate(booking.payment.paid_at)}
                  </span>
                )}
              </div>
              <div className="mt-5 flex flex-col gap-3">
                {booking.items.map((it) => (
                  <div key={it.id} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-body-sm text-muted">
                      {it.item_type === "parking" ? it.parking_type?.name : it.add_on_service?.name}
                    </span>
                    <span className="whitespace-nowrap text-body-sm font-semibold text-ink tabular-nums">
                      {formatBRL(it.subtotal)}
                    </span>
                  </div>
                ))}
                {booking.fare_price_cents > 0 && (
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-body-sm text-muted">
                      Tarifa {FARE_TIER_LABEL[booking.fare_tier]}
                    </span>
                    <span className="whitespace-nowrap text-body-sm font-semibold text-ink tabular-nums">
                      {formatBRL(fareReais(booking.fare_price_cents))}
                    </span>
                  </div>
                )}
                <div className="flex items-baseline justify-between gap-3 border-t border-hairline pt-3.5">
                  <span className="text-body-md font-bold text-ink">Total</span>
                  <span className="whitespace-nowrap text-display-md tabular-nums text-ink">
                    {formatBRL(booking.total_amount)}
                  </span>
                </div>
              </div>
              {booking.payment && !booking.payment.paid_at && (
                <p className="mt-4 text-caption-sm text-muted">Pagamento aguardando confirmação.</p>
              )}
            </section>

            <section className="rounded-lg bg-canvas p-6 desktop:p-7">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-title-md text-ink">
                  Tarifa {FARE_TIER_LABEL[booking.fare_tier]}
                </h2>
                {beneficios.length > 0 && (
                  <span className="rounded-full bg-mp-pale px-2.5 py-1 text-badge text-mp-indigo">
                    o que está incluso
                  </span>
                )}
              </div>

              {beneficios.length > 0 ? (
                <ul className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3 tablet:grid-cols-2">
                  {beneficios.map((b) => (
                    <li key={b.key} className="flex items-center gap-2.5">
                      <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
                      <span className="text-body-sm text-muted">{b.label}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-body-sm text-muted">
                  Esta tarifa não inclui alterações depois da compra.
                </p>
              )}

              {temAcao && (
                <div className="mt-5 flex flex-wrap gap-2.5 border-t border-hairline pt-5">
                  {(canChangeDates || canChangePaidDates) && (
                    <FareAction onClick={() => setDatesOpen(true)}>Alterar datas</FareAction>
                  )}
                  {canChangeVehicle && (
                    <FareAction onClick={() => setVehicleOpen(true)}>Trocar veículo</FareAction>
                  )}
                  {selfCancel.allowed && (
                    <button
                      type="button"
                      onClick={() => setCancelOpen(true)}
                      data-testid="cancel-booking-trigger"
                      className="h-11 rounded-md px-4 text-caption-sm font-semibold text-error transition-colors hover:bg-badge-cancelled-bg"
                    >
                      Cancelar reserva
                    </button>
                  )}
                </div>
              )}

              {cancelNote && <p className="mt-3.5 text-caption-sm text-muted">{cancelNote}</p>}
              {cancelBlocked && (
                <p className="mt-3.5 text-caption-sm text-muted" data-testid="cancel-window-closed">
                  A janela de cancelamento da sua tarifa {FARE_TIER_LABEL[booking.fare_tier]} já
                  encerrou. Para cancelar, fale com o suporte.
                </p>
              )}

              {/* Convite de upgrade só quando a tarifa atual não cobre a ação (E2.8-j). */}
              {canUpgrade && !canChangeDates && !canChangePaidDates && (
                <UpgradeActionHint action="Alterar datas" onUpgrade={() => setUpgradeOpen(true)} />
              )}
              {canUpgrade && !canChangeVehicle && booking.vehicle && (
                <UpgradeActionHint action="Trocar veículo" onUpgrade={() => setUpgradeOpen(true)} />
              )}
              {canUpgrade && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => setUpgradeOpen(true)}
                  data-testid="fare-upgrade-trigger"
                >
                  Fazer upgrade de Tarifa
                </Button>
              )}
            </section>

            {canContinuePayment && (
              <section className="rounded-lg bg-canvas p-6 desktop:p-7">
                <h2 className="text-title-md text-ink">Falta o pagamento</h2>
                <p className="mt-2 text-body-sm text-muted">
                  A vaga fica bloqueada até o prazo da reserva. Depois disso ela volta pra busca.
                </p>
                <Button asChild className="mt-4">
                  <Link to={`/checkout/${booking.code}`}>Continuar pagamento</Link>
                </Button>
              </section>
            )}

            {canSeeVoucher && (
              <section className="flex flex-wrap items-start gap-4 rounded-lg bg-canvas p-6 desktop:p-7">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-mp-pale text-mp-indigo">
                  <ShieldCheck className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-[200px] flex-1">
                  <h2 className="text-title-sm text-ink">Garantia Movepark</h2>
                  <p className="mt-1.5 text-caption-sm leading-relaxed text-muted">
                    Chegou e não tinha vaga? Acionamos o estacionamento e cobrimos a diferença de
                    outro local.
                  </p>
                </div>
                <a
                  href={guarantee.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-11 shrink-0 items-center rounded-md bg-surface-soft px-4 text-caption-sm font-semibold text-ink no-underline transition-colors hover:bg-mp-pale"
                >
                  {guarantee.label}
                </a>
              </section>
            )}

            {(booking.location_detail.phone || booking.location_detail.email) && (
              <section className="rounded-lg bg-canvas p-6 desktop:p-7">
                <h2 className="text-title-md text-ink">Falar com a unidade</h2>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
                  {booking.location_detail.phone && (
                    <a
                      href={`tel:${booking.location_detail.phone}`}
                      className="inline-flex items-center gap-2 text-body-sm text-ink no-underline hover:underline"
                    >
                      <Phone className="h-4 w-4 text-mp-indigo" aria-hidden />
                      {booking.location_detail.phone}
                    </a>
                  )}
                  {booking.location_detail.email && (
                    <a
                      href={`mailto:${booking.location_detail.email}`}
                      className="inline-flex items-center gap-2 text-body-sm text-ink no-underline hover:underline"
                    >
                      <Envelope className="h-4 w-4 text-mp-indigo" aria-hidden />
                      {booking.location_detail.email}
                    </a>
                  )}
                </div>
              </section>
            )}

            {booking.status === "completed" && (
              <section className="rounded-lg bg-canvas p-6 desktop:p-7">
                <h2 className="text-title-md text-ink">Sua avaliação</h2>
                {myReview.data ? (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <RatingStars value={myReview.data.rating} />
                      {myReview.data.comment && (
                        <p className="text-body-sm text-muted">{myReview.data.comment}</p>
                      )}
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => setReviewOpen(true)}>
                      Editar avaliação
                    </Button>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-body-sm text-muted">
                      Como foi sua estadia? Sua avaliação ajuda outros motoristas.
                    </p>
                    <Button size="sm" onClick={() => setReviewOpen(true)}>
                      Avaliar
                    </Button>
                  </div>
                )}
              </section>
            )}
          </main>
        </div>
      </div>

      <CancelBookingDialog
        booking={booking}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onCancelled={() => navigate(backTo)}
      />

      <FareUpgradeDialog
        bookingCode={booking.code}
        currentTier={booking.fare_tier}
        currentFarePriceCents={booking.fare_price_cents}
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
      />

      {session?.userId && (
        <ChangeVehicleDialog
          bookingCode={booking.code}
          profileId={session.userId}
          currentVehicleId={booking.vehicle?.id ?? null}
          open={vehicleOpen}
          onOpenChange={setVehicleOpen}
        />
      )}

      {canChangePaidDates ? (
        <ChangeDatesPaidDialog
          bookingCode={booking.code}
          currentCheckIn={booking.check_in_at}
          currentCheckOut={booking.check_out_at}
          open={datesOpen}
          onOpenChange={setDatesOpen}
        />
      ) : (
        <ChangeDatesDialog
          bookingCode={booking.code}
          currentCheckIn={booking.check_in_at}
          currentCheckOut={booking.check_out_at}
          open={datesOpen}
          onOpenChange={setDatesOpen}
        />
      )}

      <ReviewForm
        open={reviewOpen}
        bookingId={booking.id}
        locationName={booking.location.name}
        existing={myReview.data}
        initialRating={deepRating}
        onOpenChange={setReviewOpen}
      />
    </div>
  );
}

/** Ação secundária do card de Tarifa: pílula quadrada de 44px, como no design. */
function FareAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-11 rounded-md bg-surface-soft px-4 text-caption-sm font-semibold text-ink transition-colors hover:bg-mp-pale"
    >
      {children}
    </button>
  );
}
