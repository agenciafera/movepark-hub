import * as React from "react";
import { Check, Rocket, Landmark, Camera } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Trilha macro do onboarding do parceiro. Deixa claro, em qualquer tela do fluxo, em que fase o
 * dono está e qual é o próximo passo. Três fases fixas:
 *   1. Publicar (a unidade tomou forma na busca)
 *   2. Recebimento (dados bancários + CNPJ + contrato)
 *   3. Fotos (o diferencial que atrai cliente)
 */
export type JourneyStage = "publicar" | "recebimento" | "fotos";

type StageDef = { key: JourneyStage; label: string; icon: React.ComponentType<{ className?: string }> };

const STAGES: StageDef[] = [
  { key: "publicar", label: "Publicar", icon: Rocket },
  { key: "recebimento", label: "Recebimento", icon: Landmark },
  { key: "fotos", label: "Fotos", icon: Camera },
];

const NEXT_HINT: Record<JourneyStage, string> = {
  publicar: "Agora é hora de cadastrar seu recebimento.",
  recebimento: "Cadastre seus dados de recebimento para começar a vender.",
  fotos: "Suba pelo menos 1 foto. Sem foto, sua unidade não entra na busca.",
};

export function OnboardingJourney({
  current,
  completed = [],
  className,
}: {
  current: JourneyStage;
  /** fases já concluídas (as anteriores à atual entram automaticamente). */
  completed?: JourneyStage[];
  className?: string;
}) {
  const currentIndex = STAGES.findIndex((s) => s.key === current);

  function statusOf(index: number, key: JourneyStage): "done" | "current" | "upcoming" {
    if (completed.includes(key) || index < currentIndex) return "done";
    if (index === currentIndex) return "current";
    return "upcoming";
  }

  return (
    <div className={cn("rounded-lg border border-hairline bg-canvas p-4 tablet:p-5", className)}>
      <p className="mb-3 text-caption-sm font-medium text-muted-steel">Sua jornada na Movepark</p>
      <ol className="flex items-center">
        {STAGES.map((stage, index) => {
          const status = statusOf(index, stage.key);
          const Icon = stage.icon;
          const isLast = index === STAGES.length - 1;
          return (
            <li key={stage.key} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors",
                    status === "done" && "border-success bg-success text-white",
                    status === "current" && "border-mp-primary bg-mp-primary text-white shadow-tier",
                    status === "upcoming" && "border-hairline bg-surface-soft text-muted-steel",
                  )}
                >
                  {status === "done" ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span
                  className={cn(
                    "text-caption-sm font-medium",
                    status === "upcoming" ? "text-muted-steel" : "text-ink",
                  )}
                >
                  {stage.label}
                </span>
              </div>
              {!isLast && (
                <span
                  className={cn(
                    "mx-2 mb-5 h-0.5 flex-1 rounded-full transition-colors",
                    index < currentIndex || completed.includes(stage.key)
                      ? "bg-success"
                      : "bg-hairline",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-body-sm text-muted">
        <span className="font-semibold text-ink">Próximo passo:</span> {NEXT_HINT[current]}
      </p>
    </div>
  );
}
