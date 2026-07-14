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
 * Avalia o cancelamento de uma reserva. O prazo grátis vem da Tarifa (E2.8): `fareCancelUntil`
 * snapshot da reserva (Superflex = 1 min antes); sem ele, cai no padrão de 24h (PRD-12).
 * `now` é injetado para testabilidade.
 */
export function cancellationStatus(
  checkInAt: string | Date,
  now: Date,
  fareCancelUntil?: string | Date | null,
): CancellationStatus {
  const checkIn = new Date(checkInAt).getTime();
  const hoursUntilCheckIn = (checkIn - now.getTime()) / (1000 * 60 * 60);
  const deadline = fareCancelUntil
    ? new Date(fareCancelUntil)
    : new Date(checkIn - FREE_CANCEL_WINDOW_HOURS * 60 * 60 * 1000);
  return {
    free: now.getTime() <= deadline.getTime(),
    deadline,
    hoursUntilCheckIn,
  };
}

/**
 * Se o CLIENTE pode se auto-cancelar. Espelho do `refundDecision` da Edge (a verdade é o servidor):
 * - `pending` → pode a qualquer hora (hold não pago, só libera a vaga);
 * - `confirmed` dentro da janela da Tarifa → pode, com estorno integral (`free`);
 * - `confirmed` fora da janela → BLOQUEADO (decisão PO jul/2026; só staff cancela);
 * - demais estados (checked_in/completed/cancelled/no_show) → terminal, não cancela.
 * `now` é injetado para testabilidade.
 */
export type SelfCancelGate =
  | { allowed: true; free: boolean }
  | { allowed: false; reason: "window_closed" | "terminal" };

export function customerSelfCancel(
  status: string,
  checkInAt: string | Date,
  now: Date,
  fareCancelUntil?: string | Date | null,
): SelfCancelGate {
  if (status === "pending") return { allowed: true, free: false };
  if (status === "confirmed") {
    return cancellationStatus(checkInAt, now, fareCancelUntil).free
      ? { allowed: true, free: true }
      : { allowed: false, reason: "window_closed" };
  }
  return { allowed: false, reason: "terminal" };
}

/** Cópia padrão da política (fonte única de verdade da marca). */
export const CANCELLATION_POLICY_LINES = [
  "Cancelamento grátis até 24 horas antes do horário de check-in, com reembolso integral.",
  "Após esse prazo, o cancelamento fica com o suporte.",
];

/** Rótulo com o prazo concreto: "Cancele grátis até 14/06/2026 22:00". Respeita a janela da Tarifa. */
export function freeCancelDeadlineLabel(
  checkInAt: string | Date,
  fareCancelUntil?: string | Date | null,
): string {
  const { deadline } = cancellationStatus(checkInAt, new Date(0), fareCancelUntil);
  return `Cancele grátis até ${formatDateTime(deadline)}`;
}
