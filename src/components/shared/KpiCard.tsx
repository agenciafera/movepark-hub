import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";

/** No Phosphor, `Icon` é valor; o tipo do componente é este. */
type Icon = ComponentType<IconProps>;
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Acento de cor do KPI: um chip claro atrás do ícone, na mesma família de cor. Traz
 * vida sem quebrar a regra do violeta (que segue reservado a acionável): as cores
 * vêm de tints neutros/semânticos, não do violeta-CTA.
 */
export type KpiAccent = "indigo" | "green" | "amber" | "teal" | "rose" | "sky";

const ACCENT: Record<KpiAccent, string> = {
  indigo: "bg-mp-pale text-mp-indigo",
  green: "bg-green-50 text-green-700",
  amber: "bg-amber-50 text-amber-700",
  teal: "bg-teal-50 text-teal-700",
  rose: "bg-rose-50 text-rose-700",
  sky: "bg-sky-50 text-sky-700",
};

type Props = {
  label: string;
  value: React.ReactNode;
  hint?: string;
  trend?: { value: string; positive?: boolean };
  isLoading?: boolean;
  /** Ícone do canto (dá leitura de relance). Sem ele, o card é só texto. */
  icon?: Icon;
  /** Cor do chip do ícone. Default: indigo (marca). */
  accent?: KpiAccent;
  /** Card em destaque: faixa navy preenchida, texto branco. Use no KPI principal. */
  highlight?: boolean;
};

export function KpiCard({
  label,
  value,
  hint,
  trend,
  isLoading,
  icon: Icon,
  accent = "indigo",
  highlight = false,
}: Props) {
  return (
    <Card className={cn(highlight && "border-transparent bg-dashboard-hero text-white")}>
      <CardContent className="flex items-start justify-between gap-3 p-6">
        <div className="flex min-w-0 flex-col">
          {/* Três tiers claros: rótulo (quieto, médio) → valor (herói, bold) →
              sublinha (nota de rodapé, menor e mais clara). Cada um difere em
              tamanho, peso E cor, pra hierarquia ler de relance. */}
          <span
            className={cn(
              "text-caption font-medium",
              highlight ? "text-white/70" : "text-muted",
            )}
          >
            {label}
          </span>
          {isLoading ? (
            <Skeleton className={cn("mt-2 h-8 w-28", highlight && "bg-white/20")} />
          ) : (
            <span
              className={cn(
                "mt-1.5 text-display-xl tabular-nums",
                highlight ? "text-white" : "text-ink",
              )}
            >
              {value}
            </span>
          )}
          {(hint || trend) && (
            <div className="mt-1.5 flex items-center gap-2">
              {hint && (
                <span
                  className={cn(
                    "text-caption-sm",
                    highlight ? "text-white/50" : "text-muted-soft",
                  )}
                >
                  {hint}
                </span>
              )}
              {trend && (
                <span
                  className={cn(
                    "text-caption-sm font-medium",
                    highlight
                      ? "text-white/80"
                      : trend.positive === false
                        ? "text-error"
                        : "text-success",
                  )}
                >
                  {trend.value}
                </span>
              )}
            </div>
          )}
        </div>
        {Icon && (
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              highlight ? "bg-white/15 text-white" : ACCENT[accent],
            )}
            aria-hidden
          >
            <Icon className="h-5 w-5" />
          </span>
        )}
      </CardContent>
    </Card>
  );
}
