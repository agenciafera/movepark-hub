import * as React from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowRight, Tray } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { useAuth } from "@/auth/context";
import {
  useCheckoutBooking,
  useHandoffRedemption,
  useTermsAccepted,
} from "@/features/checkout/api";
import { wantsPayStep } from "@/features/checkout/handoff";
import { Countdown } from "@/features/checkout/Countdown";
import { KeepAliveModal } from "@/features/checkout/KeepAliveModal";
import { Stepper } from "@/features/checkout/Stepper";
import { Step1Identity } from "@/features/checkout/Step1Identity";
import { Step2Vehicle } from "@/features/checkout/Step2Vehicle";
import { Step3Addons } from "@/features/checkout/Step3Addons";
import { Step4Payment } from "@/features/checkout/Step4Payment";
import { Step5Confirmation } from "@/features/checkout/Step5Confirmation";
import { SummaryCard } from "@/features/checkout/SummaryCard";
import { SummaryDrawer } from "@/features/checkout/SummaryDrawer";
import { formatDuration } from "@/lib/format";
import { useLocationAddOns } from "@/features/listing/api";
import {
  isCheckoutBlocked,
  nextStepOnConfirm,
  resolveCheckoutGate,
  resolveInitialStep,
  stepAfter,
  stepBefore,
  visibleSteps,
  type CheckoutStep,
} from "@/features/checkout/checkout.logic";

export default function CheckoutPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { session, isLoading: authLoading } = useAuth();
  // Handoff (reserva por agente): se a URL tem #ht=, troca por sessão antes do gate de login.
  const { redeeming } = useHandoffRedemption();
  const { data: booking, isLoading, error } = useCheckoutBooking(code);
  const { data: termsAccepted } = useTermsAccepted(booking?.id);
  const [step, setStep] = React.useState<CheckoutStep>(1);

  // O passo de adicionais só existe se a unidade oferecer algum, então a régua de
  // progresso e a navegação dependem do catálogo. Enquanto ele não chega, o Stepper
  // segura: desenhar 4 passos e virar 5 (ou o contrário) salta na frente do cliente.
  const { data: addons } = useLocationAddOns(booking?.location.id);
  const addonsCarregados = addons !== undefined;
  const hasAddons = (addons?.length ?? 0) > 0;

  // Passo inicial: só cai no pagamento quando o link pediu (?pay=1) E a reserva está pronta
  // (dados do pagador + Termos aceitos). Deriva do estado; roda uma vez quando os dados chegam.
  const initialStepSet = React.useRef(false);
  React.useEffect(() => {
    if (initialStepSet.current || !booking || termsAccepted === undefined) return;
    initialStepSet.current = true;
    const hasPayerData = !!(booking.customer_tax_id && booking.customer_phone && booking.customer_email);
    const initial = resolveInitialStep({
      requestedPay: wantsPayStep(window.location.search),
      hasPayerData,
      termsAccepted: !!termsAccepted,
    });
    if (initial !== 1) setStep(initial);
  }, [booking, termsAccepted]);

  // Auto-avança pro Step 4 quando o pagamento for confirmado
  React.useEffect(() => {
    if (!booking?.status) return;
    const next = nextStepOnConfirm(booking.status, step);
    if (next) setStep(next);
  }, [booking?.status, step]);

  const gate = resolveCheckoutGate({
    authLoading: authLoading || redeeming,
    bookingLoading: isLoading,
    hasSession: !!session,
    userId: session?.userId ?? null,
    code,
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
          icon={<Tray className="h-10 w-10" />}
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
  const expired = isCheckoutBlocked(booking.expires_at, booking.status);

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
        <div className="mb-6">
          {addonsCarregados ? (
            <Stepper current={step} steps={visibleSteps(hasAddons)} />
          ) : (
            <Skeleton className="mx-auto h-7 w-full max-w-[760px] rounded-full" />
          )}
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
                  customerEmail={booking.customer_email}
                  passengerFirstName={booking.passenger_first_name}
                  passengerLastName={booking.passenger_last_name}
                  passengerPhone={booking.passenger_phone}
                  onNext={() => setStep(2)}
                />
              ) : step === 2 ? (
                <Step2Vehicle
                  bookingId={booking.id}
                  selectedVehicleId={booking.vehicle_id}
                  passengerCount={booking.passenger_count}
                  hasPcd={booking.has_pcd}
                  onBack={() => setStep(1)}
                  onNext={() => setStep(stepAfter(2, hasAddons))}
                />
              ) : step === 3 ? (
                <Step3Addons
                  code={booking.code}
                  locationId={booking.location.id}
                  vehicleId={booking.vehicle_id}
                  operatorName={booking.location.company.name}
                  selectedIds={booking.items
                    .filter((i) => i.item_type === "add_on" && i.add_on_service_id)
                    .map((i) => i.add_on_service_id as string)}
                  onBack={() => setStep(2)}
                  onNext={() => setStep(4)}
                />
              ) : step === 4 ? (
                <Step4Payment
                  bookingId={booking.id}
                  bookingCode={booking.code}
                  totalAmount={booking.total_amount}
                  customerTaxId={booking.customer_tax_id}
                  paymentStatus={booking.payment?.status ?? null}
                  onBack={() => setStep(stepBefore(4, hasAddons))}
                />
              ) : (
                <Step5Confirmation booking={booking} />
              )}
            </div>

          </main>

          <aside className="hidden desktop:block">
            <div className="sticky top-28">
              <SummaryCard booking={booking} />
            </div>
          </aside>
        </div>
      </div>

      {/* Resumo do mobile: gaveta presa no rodapé, com o CTA do passo dentro dela.
          Fica fora do <main> pra que o `sticky` se apoie na página inteira, e não
          na célula da grade. Na confirmação não existe mais o que resumir. */}
      {!expired && step !== 5 && (
        <SummaryDrawer
          total={booking.total_amount}
          subtitle={[
            formatDuration(booking.check_in_at, booking.check_out_at),
            booking.price_breakdown?.fare?.label
              ? `Tarifa ${booking.price_breakdown.fare.label}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          cta={
            showMobileCta ? (
              <Button form="checkout-step-form" type="submit" className="w-full">
                Continuar
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : undefined
          }
        >
          <SummaryCard booking={booking} bare />
        </SummaryDrawer>
      )}
    </div>
  );
}
