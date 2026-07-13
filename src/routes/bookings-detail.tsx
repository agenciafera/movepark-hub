import * as React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Inbox, ExternalLink, Phone, Mail, ShieldCheck } from "lucide-react";
import { BOOKING_STATUS_LABELS, StatusBadge } from "@/components/shared/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/shared/EmptyState";
import { Voucher } from "@/features/bookings/Voucher";
import { CancelBookingDialog } from "@/features/bookings/CancelBookingDialog";
import { FareDisplay } from "@/features/fares/FareDisplay";
import { FareUpgradeDialog } from "@/features/fares/FareUpgradeDialog";
import { ChangeVehicleDialog } from "@/features/bookings/ChangeVehicleDialog";
import { ChangeDatesDialog } from "@/features/bookings/ChangeDatesDialog";
import { useBookingDetail } from "@/features/bookings/customerApi";
import { useAuth } from "@/auth/context";
import { guaranteeChannel } from "@/features/guarantee/whatsapp";
import { useMyReview } from "@/features/reviews/api";
import { ReviewForm } from "@/features/reviews/ReviewForm";
import { RatingStars } from "@/features/reviews/RatingStars";
import { formatBRL, formatDateTime, formatDuration } from "@/lib/format";
import { FARE_TIER_LABEL, fareReais } from "@/lib/fares";

export default function BookingDetailPage() {
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
          icon={<Inbox className="h-10 w-10" />}
          title="Reserva não encontrada"
          description="Verifique o código e tente de novo."
          action={
            <Button asChild>
              <Link to="/bookings">Minhas reservas</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const canSeeVoucher = booking.status === "confirmed" || booking.status === "checked_in";
  const canCancel =
    booking.status === "pending" || booking.status === "confirmed";
  const canContinuePayment = booking.status === "pending";

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-8 desktop:px-8">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-3 print:hidden">
        <Link to="/bookings">
          <ArrowLeft className="h-4 w-4" />
          Minhas reservas
        </Link>
      </Button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="space-y-1">
          <h1 className="text-display-lg text-ink">
            Reserva {booking.code}
          </h1>
          <p className="text-body-sm text-muted">
            Criada em {formatDateTime(booking.created_at)}
          </p>
        </div>
        <StatusBadge status={booking.status} />
      </div>

      <div className="grid grid-cols-1 gap-8 desktop:grid-cols-[1fr_360px]">
        {/* Coluna esquerda */}
        <main className="space-y-6 print:hidden">
          <section className="rounded-md border border-hairline bg-canvas p-6">
            <h2 className="text-title-md text-ink">
              {booking.parking_type?.name ?? "Vaga"} ·{" "}
              {booking.location.company.name}
            </h2>
            <p className="mt-1 text-body-sm text-muted">
              {/* Marca (company) e unidade (location) às vezes têm o mesmo nome (rede de 1 unidade):
                  nesse caso o título já mostra o nome, então aqui fica só o endereço. */}
              {booking.location.company.name === booking.location.name
                ? booking.location.address
                : `${booking.location.name}${
                    booking.location.address ? ` · ${booking.location.address}` : ""
                  }`}
            </p>
            {booking.location_detail.latitude != null && (
              <Button
                variant="secondary"
                size="sm"
                asChild
                className="mt-3"
              >
                <a
                  href={`https://www.google.com/maps?q=${booking.location_detail.latitude},${booking.location_detail.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                  Como chegar
                </a>
              </Button>
            )}
          </section>

          <section className="rounded-md border border-hairline bg-canvas p-6">
            <h3 className="text-title-md text-ink">Datas</h3>
            <div className="mt-3 space-y-2 text-body-sm">
              <Row label="Check-in" value={formatDateTime(booking.check_in_at)} />
              <Row label="Check-out" value={formatDateTime(booking.check_out_at)} />
              <Row label="Duração" value={formatDuration(booking.check_in_at, booking.check_out_at)} />
              {booking.passenger_count != null && (
                <Row label="Passageiros" value={String(booking.passenger_count)} />
              )}
            </div>
            {booking.fare_benefits?.date_change === true &&
              booking.status === "pending" &&
              new Date(booking.check_in_at) > new Date() && (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setDatesOpen(true)}>
                  Alterar datas
                </Button>
              )}
          </section>

          <section className="rounded-md border border-hairline bg-canvas p-6">
            <h3 className="text-title-md text-ink">Tarifa</h3>
            <div className="mt-3">
              <FareDisplay
                fareTier={booking.fare_tier}
                farePriceCents={booking.fare_price_cents}
                fareCancelUntil={booking.fare_cancel_until}
                benefits={booking.fare_benefits}
                checkInAt={booking.check_in_at}
              />
            </div>
            {booking.fare_tier !== "superflex" &&
              ["pending", "confirmed"].includes(booking.status) &&
              new Date(booking.check_in_at) > new Date() && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => setUpgradeOpen(true)}
                >
                  Fazer upgrade de Tarifa
                </Button>
              )}
          </section>

          {booking.vehicle && (
            <section className="rounded-md border border-hairline bg-canvas p-6">
              <h3 className="text-title-md text-ink">Veículo</h3>
              <div className="mt-3 space-y-2 text-body-sm">
                <Row label="Placa" value={booking.vehicle.license_plate} />
                {booking.vehicle.model && (
                  <Row label="Modelo" value={booking.vehicle.model} />
                )}
                {booking.vehicle.color && (
                  <Row label="Cor" value={booking.vehicle.color} />
                )}
              </div>
              {booking.fare_benefits?.plate_change === true &&
                ["pending", "confirmed"].includes(booking.status) &&
                new Date(booking.check_in_at) > new Date() && (
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => setVehicleOpen(true)}>
                    Trocar veículo
                  </Button>
                )}
            </section>
          )}

          <section className="rounded-md border border-hairline bg-canvas p-6">
            <h3 className="text-title-md text-ink">Pagamento</h3>
            <div className="mt-3 space-y-1.5 text-body-sm">
              {booking.items.map((it) => (
                <div key={it.id} className="flex justify-between">
                  <span className="text-ink">
                    {it.item_type === "parking"
                      ? it.parking_type?.name
                      : it.add_on_service?.name}
                  </span>
                  <span className="text-ink tabular-nums">
                    {formatBRL(it.subtotal)}
                  </span>
                </div>
              ))}
              {booking.fare_price_cents > 0 && (
                <div className="flex justify-between">
                  <span className="text-ink">Tarifa {FARE_TIER_LABEL[booking.fare_tier]}</span>
                  <span className="text-ink tabular-nums">
                    {formatBRL(fareReais(booking.fare_price_cents))}
                  </span>
                </div>
              )}
              <Separator className="my-3" />
              <div className="flex justify-between text-title-md text-ink">
                <span>Total</span>
                <span className="tabular-nums">
                  {formatBRL(booking.total_amount)}
                </span>
              </div>
              {booking.payment && (
                <p className="mt-2 text-caption text-muted">
                  {/* ADR-004: o gateway fica invisível pro cliente — não mostrar o slug do provedor. */}
                  {booking.payment.paid_at
                    ? `Pagamento confirmado em ${formatDateTime(booking.payment.paid_at)}`
                    : "Pagamento aguardando confirmação"}
                </p>
              )}
            </div>
          </section>

          {(booking.location_detail.phone || booking.location_detail.email) && (
            <section className="rounded-md border border-hairline bg-canvas p-6">
              <h3 className="text-title-md text-ink">Precisa de ajuda?</h3>
              <div className="mt-3 space-y-2 text-body-sm">
                {booking.location_detail.phone && (
                  <a
                    href={`tel:${booking.location_detail.phone}`}
                    className="inline-flex items-center gap-2 text-ink no-underline hover:underline"
                  >
                    <Phone className="h-4 w-4 text-mp-indigo" />
                    {booking.location_detail.phone}
                  </a>
                )}
                {booking.location_detail.email && (
                  <a
                    href={`mailto:${booking.location_detail.email}`}
                    className="inline-flex items-center gap-2 text-ink no-underline hover:underline"
                  >
                    <Mail className="h-4 w-4 text-mp-indigo" />
                    {booking.location_detail.email}
                  </a>
                )}
              </div>
            </section>
          )}

          {booking.status === "completed" && (
            <section className="rounded-md border border-hairline bg-canvas p-6">
              <h3 className="text-title-md text-ink">Sua avaliação</h3>
              {myReview.data ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
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
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
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

          {(canContinuePayment || canCancel) && (
            <section className="flex flex-wrap gap-3">
              {canContinuePayment && (
                <Button asChild>
                  <Link to={`/checkout/${booking.code}`}>
                    Continuar pagamento
                  </Link>
                </Button>
              )}
              {canCancel && (
                <Button variant="danger" onClick={() => setCancelOpen(true)}>
                  Cancelar reserva
                </Button>
              )}
            </section>
          )}
        </main>

        {/* Coluna direita / voucher. No mobile, quando há voucher, ele sobe pro topo (é o que a
            pessoa abre no aeroporto). No desktop fica na lateral e gruda (sticky) enquanto a
            coluna esquerda rola, evitando o vazio à direita. */}
        <aside
          className={`space-y-6 desktop:sticky desktop:top-8 desktop:self-start${
            canSeeVoucher ? " order-first desktop:order-none" : ""
          }`}
        >
          {canSeeVoucher ? (
            <Voucher booking={booking} />
          ) : booking.status === "pending" ? (
            <div className="rounded-md border border-warning bg-badge-pending-bg p-4 text-body-sm text-warning">
              <strong>Pagamento pendente.</strong> Finalize o pagamento pra
              receber seu voucher.
            </div>
          ) : (
            <div className="rounded-md border border-hairline bg-surface-soft p-4 text-body-sm text-muted">
              Esta reserva ({BOOKING_STATUS_LABELS[booking.status].toLowerCase()}) não tem voucher
              disponível.
            </div>
          )}

          {/* Garantia perto do voucher: é a reassurance do momento de chegada (não escondida na Ajuda). */}
          {canSeeVoucher &&
            (() => {
              const ch = guaranteeChannel({
                unitPhone: booking.location_detail.phone,
                code: booking.code,
                unitName: booking.location.name,
              });
              return (
                <div className="rounded-md border border-hairline bg-canvas p-4">
                  <p className="text-body-sm text-ink">
                    Chegou e não tinha vaga? Você tem a garantia Movepark.
                  </p>
                  <Button variant="secondary" size="sm" className="mt-3 w-full" asChild>
                    <a href={ch.href} target="_blank" rel="noreferrer">
                      <ShieldCheck className="h-4 w-4" />
                      {ch.label}
                    </a>
                  </Button>
                </div>
              );
            })()}
        </aside>
      </div>

      <CancelBookingDialog
        booking={booking}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onCancelled={() => navigate("/bookings")}
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

      <ChangeDatesDialog
        bookingCode={booking.code}
        currentCheckIn={booking.check_in_at}
        currentCheckOut={booking.check_out_at}
        open={datesOpen}
        onOpenChange={setDatesOpen}
      />

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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink">{value}</span>
    </div>
  );
}
