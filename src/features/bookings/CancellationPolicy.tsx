import { cn } from "@/lib/utils";
import { CANCELLATION_POLICY_LINES, freeCancelDeadlineLabel } from "./cancellation.logic";

type Props = {
  /** Quando informado, mostra o prazo concreto ("Cancele grátis até …"). */
  checkInAt?: string | null;
  /** Texto livre do operador (location.reservation_policy), como adendo. */
  operatorPolicy?: string | null;
  className?: string;
};

/** Política de cancelamento padrão (PRD-12) — corpo reutilizável (listing + checkout). */
export function CancellationPolicy({ checkInAt, operatorPolicy, className }: Props) {
  return (
    <div className={cn("space-y-2", className)}>
      {checkInAt && (
        <p className="text-body-md font-medium text-ink">{freeCancelDeadlineLabel(checkInAt)}</p>
      )}
      <ul className="space-y-1 text-body-md text-body">
        {CANCELLATION_POLICY_LINES.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      {operatorPolicy && <p className="text-body-sm text-muted">{operatorPolicy}</p>}
    </div>
  );
}
