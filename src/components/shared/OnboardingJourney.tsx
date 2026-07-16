import * as React from "react";
import { Link } from "react-router-dom";
import { Check, Eye, Landmark, Camera, Rocket, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Trilha macro do onboarding do parceiro. Deixa claro, em qualquer tela do fluxo, em que fase o
 * dono está e qual é o próximo passo. Quatro fases fixas, da aprovação do lead até a venda:
 *   1. Preview (montar a unidade e ver como ela fica)
 *   2. Recebimento (dados bancários + CNPJ + contrato)
 *   3. Fotos (o diferencial que atrai cliente, obrigatório pra vender)
 *   4. Publicar/Vender (unidade no ar, recebendo reservas)
 */
export type JourneyStage = "preview" | "recebimento" | "fotos" | "vender";

type StageDef = { key: JourneyStage; label: string; icon: React.ComponentType<{ className?: string }> };

const STAGES: StageDef[] = [
  { key: "preview", label: "Preview", icon: Eye },
  { key: "recebimento", label: "Recebimento", icon: Landmark },
  { key: "fotos", label: "Fotos", icon: Camera },
  { key: "vender", label: "Publicar/Vender", icon: Rocket },
];

const NEXT_HINT: Record<JourneyStage, string> = {
  preview: "Monte sua unidade e veja como ela fica.",
  recebimento: "Cadastre seus dados de recebimento para começar a vender.",
  fotos: "Suba pelo menos 1 foto. Sem foto, sua unidade não entra na busca.",
  vender: "Tudo pronto! Sua unidade está no ar, recebendo reservas.",
};

export function OnboardingJourney({
  current,
  completed = [],
  className,
  hint,
  cta,
}: {
  current: JourneyStage;
  /** fases já concluídas (as anteriores à atual entram automaticamente). */
  completed?: JourneyStage[];
  className?: string;
  /** sobrescreve o texto padrão de "Próximo passo" (ex.: recebimento em análise). */
  hint?: string;
  /** botão opcional que leva à ação da fase atual (usado no banner persistente do painel). */
  cta?: { to: string; label: string };
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
              <div className="flex min-w-0 flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    status === "done" && "border-success bg-success text-white",
                    status === "current" && "border-mp-primary bg-mp-primary text-white shadow-tier",
                    status === "upcoming" && "border-hairline bg-surface-soft text-muted-steel",
                  )}
                >
                  {status === "done" ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span
                  className={cn(
                    "max-w-[4.5rem] text-center text-[11px] font-medium leading-tight break-words tablet:max-w-none tablet:text-caption-sm",
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
      <div className="mt-3 flex flex-col gap-3 tablet:flex-row tablet:items-center tablet:justify-between">
        <p className="text-body-sm text-muted">
          <span className="font-semibold text-ink">Próximo passo:</span> {hint ?? NEXT_HINT[current]}
        </p>
        {cta && (
          <Button asChild size="sm" className="w-fit shrink-0">
            <Link to={cta.to}>
              {cta.label} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
