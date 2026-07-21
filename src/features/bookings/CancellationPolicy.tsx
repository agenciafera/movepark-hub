import { cn } from "@/lib/utils";
import { cancellationPolicyLines, freeCancelDeadlineLabel } from "./cancellation.logic";

type Props = {
  /** Quando informado, mostra o prazo concreto ("Cancele grátis até …"). */
  checkInAt?: string | null;
  /** Prazo da Tarifa (E2.8) — sobrepõe o padrão de 24h (Superflex = 1 min antes). */
  fareCancelUntil?: string | null;
  /** Texto livre do operador (location.reservation_policy), como adendo. */
  operatorPolicy?: string | null;
  className?: string;
};

/** Política de cancelamento padrão (PRD-12) — corpo reutilizável (listing + checkout). */
export function CancellationPolicy({ checkInAt, fareCancelUntil, operatorPolicy, className }: Props) {
  return (
    <div className={cn("space-y-2", className)}>
      {checkInAt && (
        <p className="text-body-md font-bold text-ink">
          {freeCancelDeadlineLabel(checkInAt, fareCancelUntil)}
        </p>
      )}
      <ul className="space-y-1 text-caption text-muted">
        {cancellationPolicyLines(checkInAt, fareCancelUntil).map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      {operatorPolicy && <p className="text-caption text-muted">{operatorPolicy}</p>}
    </div>
  );
}
