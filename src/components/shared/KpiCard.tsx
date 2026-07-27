import type { LucideIcon } from "lucide-react";
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
  icon?: LucideIcon;
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
        <div className="flex min-w-0 flex-col gap-2">
          <span className={cn("text-caption", highlight ? "text-white/60" : "text-muted")}>
            {label}
          </span>
          {isLoading ? (
            <Skeleton className={cn("h-9 w-32", highlight && "bg-white/20")} />
          ) : (
            <span className={cn("text-display-xl", highlight ? "text-white" : "text-ink")}>
              {value}
            </span>
          )}
          <div className="flex items-center gap-2 text-body-sm">
            {hint && (
              <span className={highlight ? "text-white/60" : "text-muted"}>{hint}</span>
            )}
            {trend && (
              <span
                className={cn(
                  "text-caption",
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
