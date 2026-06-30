import { Check, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDateTime } from "@/lib/format";
import {
  FARE_BENEFIT_LABELS,
  FARE_TIER_LABEL,
  fareReais,
  type FareBenefits,
  type FareTier,
} from "@/lib/fares";

type Props = {
  fareTier: FareTier;
  farePriceCents: number;
  fareCancelUntil: string | null;
  benefits: FareBenefits | null;
};

const TIER_TONE: Record<FareTier, "neutral" | "pending" | "confirmed"> = {
  basica: "neutral",
  flex: "pending",
  superflex: "confirmed",
};

/** Exibe a Tarifa contratada na reserva (E2.8-c): nível, o que cobre e a janela de cancelamento. */
export function FareDisplay({ fareTier, farePriceCents, fareCancelUntil, benefits }: Props) {
  const included = FARE_BENEFIT_LABELS.filter((b) => benefits?.[b.key] === true);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Badge tone={TIER_TONE[fareTier]}>{FARE_TIER_LABEL[fareTier]}</Badge>
        <span className="text-body-sm text-muted tabular-nums">
          {farePriceCents > 0 ? formatBRL(fareReais(farePriceCents)) : "Incluída"}
        </span>
      </div>

      {included.length > 0 && (
        <ul className="space-y-1">
          {included.map(({ key, label }) => (
            <li key={key} className="flex items-center gap-1.5 text-body-sm text-ink">
              <Check className="h-3.5 w-3.5 shrink-0 text-badge-confirmed-fg" />
              {label}
            </li>
          ))}
        </ul>
      )}

      {fareCancelUntil && (
        <p className="flex items-center gap-1.5 text-caption text-muted">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          Cancelável com reembolso até {formatDateTime(fareCancelUntil)}
        </p>
      )}
    </div>
  );
}
