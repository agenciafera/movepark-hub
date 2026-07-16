import { useAuth } from "@/auth/context";
import { useOnboardingJourney } from "@/features/onboarding/journey";
import { OnboardingJourney } from "@/components/shared/OnboardingJourney";

/**
 * Trilha "Sua jornada na Movepark" persistente no painel do operador. Aparece em todas as telas
 * do parceiro enquanto a jornada não terminou (publicar → recebimento → fotos) e some quando ele
 * já pode vender. Cada fase mostra a ação seguinte com um atalho.
 */
export function OperatorJourneyBanner() {
  const { effectiveCompanyIds } = useAuth();
  const companyId = effectiveCompanyIds[0];
  const journey = useOnboardingJourney(companyId);

  // nada de flash no loading; some de vez quando a jornada acaba.
  if (!companyId || journey.loading || journey.complete) return null;

  let hint: string | undefined;
  let cta: { to: string; label: string } | undefined;

  if (journey.current === "publicar") {
    cta = { to: "/onboarding", label: "Continuar publicação" };
  } else if (journey.current === "recebimento") {
    if (journey.recebimentoPending) {
      hint = "Recebimento em análise. A gente te avisa assim que liberar.";
      cta = { to: "/operator/recebimento", label: "Ver status" };
    } else {
      cta = { to: "/operator/recebimento", label: "Cadastrar recebimento" };
    }
  } else {
    cta = { to: "/operator/locations", label: "Adicionar fotos" };
  }

  return (
    <div className="mb-6">
      <OnboardingJourney
        current={journey.current}
        completed={journey.completed}
        hint={hint}
        cta={cta}
      />
    </div>
  );
}
