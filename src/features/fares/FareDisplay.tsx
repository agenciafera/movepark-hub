import { Check, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDateTime } from "@/lib/format";
import {
  FARE_BENEFIT_LABELS,
  FARE_TIER_LABEL,
  cancelWindowLabel,
  fareReais,
  type FareBenefits,
  type FareTier,
} from "@/lib/fares";

type Props = {
  fareTier: FareTier;
  farePriceCents: number;
  fareCancelUntil: string | null;
  benefits: FareBenefits | null;
  /** Check-in da reserva — deriva a janela de cancelamento ("até 24h antes") a partir do prazo. */
  checkInAt?: string | null;
};

const TIER_TONE: Record<FareTier, "neutral" | "pending" | "confirmed"> = {
  basica: "neutral",
  flex: "pending",
  superflex: "confirmed",
};

/** Exibe a Tarifa contratada na reserva (E2.8-c): nível, o que cobre e a janela de cancelamento. */
export function FareDisplay({ fareTier, farePriceCents, fareCancelUntil, benefits, checkInAt }: Props) {
  // Janela relativa da Tarifa (ex.: "até 24h antes"), derivada do prazo concreto vs. o check-in.
  const windowMinutes =
    fareCancelUntil && checkInAt
      ? Math.round((new Date(checkInAt).getTime() - new Date(fareCancelUntil).getTime()) / 60_000)
      : null;
  const windowLabel = cancelWindowLabel(windowMinutes);
  // Janela já vencida: mostra que encerrou (coerente com o bloqueio de cancelamento), não um prazo passado.
  const cancelWindowPassed = fareCancelUntil
    ? new Date(fareCancelUntil).getTime() < Date.now()
    : false;

  // Amarra a janela ao benefício de cancelamento; os demais seguem o rótulo padrão.
  const included = FARE_BENEFIT_LABELS.filter((b) => benefits?.[b.key] === true).map((b) =>
    b.key === "free_cancellation" && windowLabel ? { ...b, label: `Cancelamento grátis ${windowLabel}` } : b,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Badge tone={TIER_TONE[fareTier]}>{FARE_TIER_LABEL[fareTier]}</Badge>
        <span className="text-body-sm text-muted tabular-nums">
          {farePriceCents > 0 ? formatBRL(fareReais(farePriceCents)) : "Incluída"}
        </span>
      </div>

      {included.length > 0 && (
        <ul className="space-y-1.5">
          {included.map(({ key, label }) => (
            <li key={key} className="flex items-start gap-2 text-body-sm text-ink">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-badge-confirmed-fg" />
              <span>{label}</span>
            </li>
          ))}
        </ul>
      )}

      {fareCancelUntil && (
        <div className="flex items-start gap-2 rounded-md bg-surface-soft p-3">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-mp-indigo" />
          <p className="text-body-sm text-ink">
            {cancelWindowPassed ? (
              "A janela de cancelamento grátis já encerrou."
            ) : (
              <>
                Cancele com reembolso integral até{" "}
                <span className="font-semibold">{formatDateTime(fareCancelUntil)}</span>.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
