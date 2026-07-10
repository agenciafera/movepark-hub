import * as React from "react";
import { Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Clock, XCircle } from "lucide-react";
import { Wordmark } from "@/components/shared/Brand";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/context";
import { useOnboardingData } from "@/features/onboarding/wizardApi";
import { PublishWizard } from "@/features/onboarding/publish/PublishWizard";

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
  const companyId = effectiveCompanyIds[0];
  const { data, isLoading } = useOnboardingData(companyId);

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
            Seu cadastro não foi aprovado neste momento. Em caso de dúvidas, entre em contato com a equipe Movepark.
          </p>
          <Button variant="secondary" onClick={() => signOut()}>Sair</Button>
        </div>
      </Centered>
    );
  }

  // approved | in_progress → fluxo curto "Publicar" (E1.9)
  return (
    <>
      <Helmet>
        <title>Publicar seu estacionamento | Movepark</title>
      </Helmet>
      <PublishWizard data={data} companyId={companyId} />
    </>
  );
}
