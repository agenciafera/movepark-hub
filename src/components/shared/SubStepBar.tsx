import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Progresso das seções DENTRO de uma fase do cadastro (ex.: as 3 telas do recebimento). Mostra as
 * seções por NOME, sem numerar "Passo 1 de N" — a numeração/estágio macro é da trilha
 * `OnboardingJourney`, que persiste no topo. Assim não se recria um "passo 1" a cada fase.
 */
export function SubStepBar({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-stretch gap-2">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex flex-1 flex-col gap-1.5">
            <div
              className={cn(
                "h-1.5 rounded-full transition-colors",
                i <= current ? "bg-mp-primary" : "bg-surface-pale",
              )}
            />
            <span
              className={cn(
                "flex items-center gap-1 text-caption-sm",
                active ? "font-semibold text-ink" : done ? "text-muted" : "text-muted-steel",
              )}
            >
              {done && <Check className="h-3 w-3 text-success" />}
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
