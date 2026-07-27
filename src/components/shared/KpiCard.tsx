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
};

export function KpiCard({ label, value, hint, trend, isLoading, icon: Icon, accent = "indigo" }: Props) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-6">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-caption text-muted">{label}</span>
          {isLoading ? (
            <Skeleton className="h-9 w-32" />
          ) : (
            <span className="text-display-xl text-ink">{value}</span>
          )}
          <div className="flex items-center gap-2 text-body-sm">
            {hint && <span className="text-muted">{hint}</span>}
            {trend && (
              <span
                className={cn(
                  "text-caption",
                  trend.positive === false ? "text-error" : "text-success",
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
              ACCENT[accent],
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
