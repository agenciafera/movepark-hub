import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Progresso das seções DENTRO de uma fase do cadastro (ex.: as 3 telas do recebimento). Mostra as
 * seções por NOME, sem numerar "Passo 1 de N". A numeração/estágio macro é da trilha
 * `OnboardingJourney`, que persiste no topo. Assim não se recria um "passo 1" a cada fase.
 */
export function SubStepBar({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-stretch gap-2">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div
              className={cn(
                "h-1.5 rounded-full transition-colors",
                i <= current ? "bg-mp-primary" : "bg-surface-pale",
              )}
            />
            <span
              className={cn(
                "flex items-start gap-1 break-words text-[11px] leading-tight tablet:text-caption-sm",
                active ? "font-semibold text-ink" : done ? "text-muted" : "text-muted-steel",
              )}
            >
              {done && <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" />}
              <span className="min-w-0">{label}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
