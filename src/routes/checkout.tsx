import * as React from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowRight, ChevronDown, Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { useAuth } from "@/auth/context";
import { useProfile } from "@/features/profile/api";
import { useCheckoutBooking } from "@/features/checkout/api";
import { Countdown } from "@/features/checkout/Countdown";
import { KeepAliveModal } from "@/features/checkout/KeepAliveModal";
import { Stepper } from "@/features/checkout/Stepper";
import { Step1Identity } from "@/features/checkout/Step1Identity";
import { Step2Vehicle } from "@/features/checkout/Step2Vehicle";
import { Step3Payment } from "@/features/checkout/Step3Payment";
import { Step4Confirmation } from "@/features/checkout/Step4Confirmation";
import { SummaryCard } from "@/features/checkout/SummaryCard";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  isCheckoutExpired,
  nextStepOnConfirm,
  resolveCheckoutGate,
  type CheckoutStep,
} from "@/features/checkout/checkout.logic";
import type { BookingForCheckout } from "@/features/checkout/api";

/** Accordion do resumo da reserva — exibido no topo do checkout em mobile/tablet. */
function MobileBookingSummary({ booking }: { booking: BookingForCheckout }) {
  const [open, setOpen] = React.useState(false);
  const parkingItem = booking.items.find((i) => i.item_type === "parking");

  return (
    <div className="overflow-hidden rounded-md border border-hairline bg-canvas shadow-tier">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="truncate text-title-md text-ink">
            {booking.location.company.name}
            {parkingItem?.parking_type?.name ? ` • ${parkingItem.parking_type.name}` : ""}
          </div>
          <div className="text-body-sm text-muted">{booking.location.name}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-display-sm text-ink tabular-nums">
            {formatBRL(booking.total_amount)}
          </span>
          <ChevronDown
            className={cn("h-4 w-4 text-muted transition-transform duration-200", open && "rotate-180")}
          />
        </div>
      </button>
      {open && (
        <div className="border-t border-hairline p-4">
          <SummaryCard booking={booking} bare />
        </div>
      )}
    </div>
  );
}

export default function CheckoutPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { session, isLoading: authLoading } = useAuth();
  const profileQ = useProfile(session?.userId);
  const { data: booking, isLoading, error } = useCheckoutBooking(code);
  const [step, setStep] = React.useState<CheckoutStep>(1);

  // Auto-avança pro Step 4 quando o pagamento for confirmado
  React.useEffect(() => {
    if (!booking?.status) return;
    const next = nextStepOnConfirm(booking.status, step);
    if (next) setStep(next);
  }, [booking?.status, step]);

  const gate = resolveCheckoutGate({
    authLoading,
    bookingLoading: isLoading,
    hasSession: !!session,
    userId: session?.userId ?? null,
    code,
    profile: profileQ.data,
    hasError: !!error,
    booking,
  });

  const redirectTo = gate.kind === "redirect" ? gate.to : null;
  React.useEffect(() => {
    if (redirectTo) navigate(redirectTo, { replace: true });
  }, [redirectTo, navigate]);

  if (gate.kind === "loading") {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-12 desktop:px-8">
        <Skeleton className="mb-6 h-10 w-1/2" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (gate.kind === "redirect") return null;

  if (gate.kind === "error") {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-12 desktop:px-8">
        <div className="rounded-md border border-error bg-badge-cancelled-bg p-4 text-body-sm text-error">
          {(error as Error).message}
        </div>
      </div>
    );
  }

  if (gate.kind === "not-found") {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-12 desktop:px-8">
        <EmptyState
          icon={<Inbox className="h-10 w-10" />}
          title="Reserva não encontrada"
          description="O link pode estar errado ou a reserva foi cancelada."
          action={
            <Button asChild>
              <Link to="/">Voltar pra home</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (gate.kind === "not-owner") {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-12 desktop:px-8">
        <EmptyState
          title="Reserva não pertence a você"
          description="Faça login com a conta usada na reserva."
        />
      </div>
    );
  }

  if (!booking) return null;
  const expired = isCheckoutExpired(booking.expires_at, booking.status);

  // Barra CTA fixa mobile visível apenas nos steps com form unificado (1 e 2)
  const showMobileCta = !expired && (step === 1 || step === 2);

  return (
    <div>
      <Countdown expiresAt={booking.status === "pending" ? booking.expires_at : null} />
      {booking.status === "pending" && (
        <KeepAliveModal
          booking={{
            id: booking.id,
            status: booking.status,
            expires_at: booking.expires_at,
            created_at: booking.created_at,
          }}
        />
      )}

      <div className="mx-auto w-full max-w-[1080px] px-4 py-8 desktop:px-8">
        <h1 className="sr-only">Finalizar reserva</h1>
        <div className="mb-6 flex justify-center">
          <Stepper current={step} />
        </div>

        <div className="grid grid-cols-1 gap-8 desktop:grid-cols-[1fr_420px]">
          <main>
            {/* Conteúdo do step */}
            <div>
              {expired ? (
                <EmptyState
                  title="Sua reserva expirou"
                  description="Comece uma nova busca pra reservar essa vaga ou outra próxima."
                  action={
                    <Button asChild>
                      <Link to="/">Buscar de novo</Link>
                    </Button>
                  }
                />
              ) : step === 1 ? (
                <Step1Identity
                  bookingId={booking.id}
                  bookingCode={booking.code}
                  customerName={booking.customer_name}
                  customerPhone={booking.customer_phone}
                  onNext={() => setStep(2)}
                />
              ) : step === 2 ? (
                <Step2Vehicle
                  bookingId={booking.id}
                  selectedVehicleId={booking.vehicle_id}
                  passengerCount={booking.passenger_count}
                  hasPcd={booking.has_pcd}
                  onBack={() => setStep(1)}
                  onNext={() => setStep(3)}
                />
              ) : step === 3 ? (
                <Step3Payment
                  bookingCode={booking.code}
                  totalAmount={booking.total_amount}
                  paymentStatus={booking.payment?.status ?? null}
                  onBack={() => setStep(2)}
                />
              ) : (
                <Step4Confirmation booking={booking} />
              )}
            </div>

            {/* Resumo accordion — abaixo do form, mobile/tablet apenas, exceto confirmação */}
            {!expired && step !== 4 && (
              <div className={cn("mt-6 desktop:hidden", showMobileCta && "pb-20")}>
                <MobileBookingSummary booking={booking} />
              </div>
            )}
          </main>

          <aside className="hidden desktop:block">
            <div className="sticky top-28">
              <SummaryCard booking={booking} />
            </div>
          </aside>
        </div>
      </div>

      {/* Barra CTA fixa no rodapé — mobile/tablet, steps 1 e 2 */}
      {showMobileCta && (
        <div className="fixed bottom-0 inset-x-0 z-20 border-t border-hairline bg-canvas px-4 py-3 desktop:hidden">
          <Button form="checkout-step-form" type="submit" className="w-full">
            Continuar
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
