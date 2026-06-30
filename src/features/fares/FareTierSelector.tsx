import { Check, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { FARE_BENEFIT_LABELS, fareReais, type FareOption, type FareTier } from "@/lib/fares";

type Props = {
  options: FareOption[];
  selected: FareTier;
  onSelect: (tier: FareTier) => void;
  isLoading?: boolean;
};

/**
 * Seletor de Tarifa no padrão good-better-best (E2.8-b). Sem dark pattern: a Básica é o default e
 * os preços/benefícios são explícitos. A "Mais popular" (Flex) ganha destaque, não pressão.
 */
export function FareTierSelector({ options, selected, onSelect, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid gap-2 tablet:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-44 w-full rounded-md" />
        ))}
      </div>
    );
  }
  if (options.length === 0) return null;

  return (
    <fieldset>
      <legend className="mb-2 text-caption font-semibold text-muted-steel">
        Flexibilidade da reserva
      </legend>
      <div className="grid gap-2 tablet:grid-cols-3">
        {options.map((opt) => {
          const isSelected = opt.tier === selected;
          const free = opt.price_cents === 0;
          return (
            <button
              key={opt.tier}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(opt.tier)}
              className={cn(
                "relative flex flex-col rounded-md border p-3 text-left transition-colors",
                isSelected
                  ? "border-ink ring-1 ring-ink"
                  : "border-hairline hover:border-ink/40",
              )}
            >
              {opt.is_popular && (
                <Badge tone="confirmed" className="absolute -top-2 right-3">
                  Mais popular
                </Badge>
              )}
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-body-sm font-semibold text-ink">{opt.label}</span>
                <span className="text-body-sm font-semibold text-ink tabular-nums">
                  {free ? "Grátis" : `+ ${formatBRL(fareReais(opt.price_cents))}`}
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {FARE_BENEFIT_LABELS.map(({ key, label }) => {
                  const on = opt.benefits[key] === true;
                  return (
                    <li
                      key={key}
                      className={cn(
                        "flex items-center gap-1.5 text-caption",
                        on ? "text-ink" : "text-muted/50",
                      )}
                    >
                      {on ? (
                        <Check className="h-3 w-3 shrink-0 text-badge-confirmed-fg" />
                      ) : (
                        <Minus className="h-3 w-3 shrink-0" />
                      )}
                      {label}
                    </li>
                  );
                })}
              </ul>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
