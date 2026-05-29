import * as React from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { useAuth } from "@/auth/context";
import { useProfile } from "@/features/profile/api";
import { useCheckoutBooking } from "@/features/checkout/api";
import { Countdown } from "@/features/checkout/Countdown";
import { Stepper } from "@/features/checkout/Stepper";
import { Step1Identity } from "@/features/checkout/Step1Identity";
import { Step2Vehicle } from "@/features/checkout/Step2Vehicle";
import { Step3Payment } from "@/features/checkout/Step3Payment";
import { Step4Confirmation } from "@/features/checkout/Step4Confirmation";
import { SummaryCard } from "@/features/checkout/SummaryCard";

type Step = 1 | 2 | 3 | 4;

export default function CheckoutPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { session, isLoading: authLoading } = useAuth();
  const profileQ = useProfile(session?.userId);
  const { data: booking, isLoading, error } = useCheckoutBooking(code);
  const [step, setStep] = React.useState<Step>(1);

  // Auto-avança pro Step 4 quando o pagamento for confirmado
  React.useEffect(() => {
    if (booking?.status === "confirmed" && step !== 4) {
      setStep(4);
    }
  }, [booking?.status, step]);

  if (authLoading || isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-12 desktop:px-8">
        <Skeleton className="mb-6 h-10 w-1/2" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!session) {
    const next = encodeURIComponent(`/checkout/${code}`);
    navigate(`/entrar?next=${next}`, { replace: true });
    return null;
  }

  // Gate: customer precisa de full_name + tax_id pra finalizar reserva
  if (
    profileQ.data &&
    (!profileQ.data.full_name || !profileQ.data.tax_id)
  ) {
    const next = encodeURIComponent(`/checkout/${code}`);
    navigate(`/account/complete-profile?next=${next}`, { replace: true });
    return null;
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-12 desktop:px-8">
        <div className="rounded-md border border-error bg-badge-cancelled-bg p-4 text-body-sm text-error">
          {(error as Error).message}
        </div>
      </div>
    );
  }

  if (!booking) {
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

  if (booking.profile_id !== session.userId) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-12 desktop:px-8">
        <EmptyState
          title="Reserva não pertence a você"
          description="Faça login com a conta usada na reserva."
        />
      </div>
    );
  }

  const expired =
    booking.expires_at &&
    new Date(booking.expires_at) < new Date() &&
    booking.status === "pending";

  return (
    <div>
      <Countdown
        expiresAt={booking.status === "pending" ? booking.expires_at : null}
      />

      <div className="mx-auto w-full max-w-[1080px] px-4 py-8 desktop:px-8">
        <div className="mb-6 flex justify-center">
          <Stepper current={step} />
        </div>

        <div className="grid grid-cols-1 gap-8 desktop:grid-cols-[1fr_360px]">
          <main>
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
              <Step1Identity onNext={() => setStep(2)} />
            ) : step === 2 ? (
              <Step2Vehicle
                bookingId={booking.id}
                selectedVehicleId={booking.vehicle_id}
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
          </main>

          <aside className="hidden desktop:block">
            <div className="sticky top-32">
              <SummaryCard booking={booking} />
            </div>
          </aside>
        </div>

        <div className="mt-8 desktop:hidden">
          <SummaryCard booking={booking} />
        </div>
      </div>
    </div>
  );
}
