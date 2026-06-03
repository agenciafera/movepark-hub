import * as React from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { Clock, XCircle } from "lucide-react";
import { Wordmark } from "@/components/shared/Brand";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/context";
import { OnboardingStepper } from "@/features/onboarding/OnboardingStepper";
import { useOnboardingData } from "@/features/onboarding/wizardApi";
import { Step1Company } from "@/features/onboarding/steps/Step1Company";
import { Step2Location } from "@/features/onboarding/steps/Step2Location";
import { Step3ParkingTypes } from "@/features/onboarding/steps/Step3ParkingTypes";
import { Step4Pricing } from "@/features/onboarding/steps/Step4Pricing";
import { Step5AddOns } from "@/features/onboarding/steps/Step5AddOns";
import { Step6Review } from "@/features/onboarding/steps/Step6Review";

const STEP_LABELS = ["Empresa", "Localização", "Tipos de vaga", "Precificação", "Serviços", "Revisão"];

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-surface-soft px-4 py-10">
      <div className="mb-8">
        <Wordmark height={26} />
      </div>
      <div className="w-full max-w-2xl rounded-md border border-hairline bg-canvas p-6 shadow-tier tablet:p-8">
        {children}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const { effectiveCompanyIds, signOut } = useAuth();
  const navigate = useNavigate();
  const companyId = effectiveCompanyIds[0];
  const { data, isLoading } = useOnboardingData(companyId);

  const [current, setCurrent] = React.useState<number>(1);
  const [initialized, setInitialized] = React.useState(false);

  React.useEffect(() => {
    if (data && !initialized) {
      const resume = Math.min(6, Math.max(1, (data.currentStep ?? 0) + 1));
      setCurrent(resume);
      setInitialized(true);
    }
  }, [data, initialized]);

  if (!companyId) {
    return (
      <Centered>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <h1 className="text-display-md text-ink">Nenhuma empresa vinculada</h1>
          <p className="text-body-sm text-muted">Sua conta não está vinculada a um estacionamento.</p>
          <Button variant="secondary" onClick={() => signOut()}>Sair</Button>
        </div>
      </Centered>
    );
  }

  if (isLoading || !data) {
    return (
      <Centered>
        <div className="py-10 text-center text-muted">Carregando…</div>
      </Centered>
    );
  }

  const status = data.company.onboarding_status;

  if (status === "active") return <Navigate to="/operator" replace />;

  if (status === "pending_review") {
    return (
      <Centered>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <Clock className="h-12 w-12 text-mp-indigo" />
          <h1 className="text-display-md text-ink">Seu cadastro está em análise</h1>
          <p className="max-w-md text-body-sm text-muted">
            Assim que aprovarmos, você poderá concluir a configuração do seu estacionamento. Entraremos em contato em breve.
          </p>
          <Button variant="secondary" onClick={() => signOut()}>Sair</Button>
        </div>
      </Centered>
    );
  }

  if (status === "rejected") {
    return (
      <Centered>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <XCircle className="h-12 w-12 text-error" />
          <h1 className="text-display-md text-ink">Cadastro não aprovado</h1>
          <p className="max-w-md text-body-sm text-muted">
            Seu cadastro não foi aprovado neste momento. Em caso de dúvidas, entre em contato com a equipe MovePark.
          </p>
          <Button variant="secondary" onClick={() => signOut()}>Sair</Button>
        </div>
      </Centered>
    );
  }

  // approved | in_progress → wizard
  function goNext() {
    setCurrent((c) => Math.min(6, c + 1));
  }
  function goBack() {
    setCurrent((c) => Math.max(1, c - 1));
  }
  function onSubmitted() {
    toast.success("Tudo pronto! Seu estacionamento está no ar. 🚗");
    navigate("/operator", { replace: true });
  }

  return (
    <>
      <Helmet>
        <title>Concluir cadastro — MovePark</title>
      </Helmet>
      <Centered>
        <div className="mb-6">
          <OnboardingStepper steps={STEP_LABELS} current={current} />
        </div>

        {current === 1 && <Step1Company data={data} companyId={companyId} onNext={goNext} />}
        {current === 2 && <Step2Location data={data} companyId={companyId} onNext={goNext} onBack={goBack} />}
        {current === 3 && <Step3ParkingTypes data={data} companyId={companyId} onNext={goNext} onBack={goBack} />}
        {current === 4 && <Step4Pricing data={data} companyId={companyId} onNext={goNext} onBack={goBack} />}
        {current === 5 && <Step5AddOns data={data} companyId={companyId} onNext={goNext} onBack={goBack} />}
        {current === 6 && <Step6Review data={data} companyId={companyId} onBack={goBack} onSubmitted={onSubmitted} />}
      </Centered>
    </>
  );
}
