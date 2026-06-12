import { formatDateTime } from "@/lib/format";

/** Janela de cancelamento grátis (PRD-12, decisão PO jun/2026). */
export const FREE_CANCEL_WINDOW_HOURS = 24;

export type CancellationStatus = {
  /** Dentro da janela grátis (≥ 24h antes do check-in)? */
  free: boolean;
  /** Prazo do cancelamento grátis = check_in − 24h. */
  deadline: Date;
  hoursUntilCheckIn: number;
};

/**
 * Avalia o cancelamento de uma reserva contra a regra padrão de 24h.
 * `now` é injetado para testabilidade. (Superflex/MON-11 — janela estendida paga —
 * é fora de escopo; entraria como um parâmetro futuro.)
 */
export function cancellationStatus(checkInAt: string | Date, now: Date): CancellationStatus {
  const checkIn = new Date(checkInAt).getTime();
  const hoursUntilCheckIn = (checkIn - now.getTime()) / (1000 * 60 * 60);
  return {
    free: hoursUntilCheckIn >= FREE_CANCEL_WINDOW_HOURS,
    deadline: new Date(checkIn - FREE_CANCEL_WINDOW_HOURS * 60 * 60 * 1000),
    hoursUntilCheckIn,
  };
}

/** Cópia padrão da política (fonte única de verdade da marca). */
export const CANCELLATION_POLICY_LINES = [
  "Cancelamento grátis até 24 horas antes do horário de check-in — reembolso integral.",
  "Após esse prazo, você ainda pode cancelar, mas sem reembolso.",
];

/** Rótulo com o prazo concreto: "Cancele grátis até 14/06/2026 22:00". */
export function freeCancelDeadlineLabel(checkInAt: string | Date): string {
  const { deadline } = cancellationStatus(checkInAt, new Date(0));
  return `Cancele grátis até ${formatDateTime(deadline)}`;
}
