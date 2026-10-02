import type { BookingStateSummary } from "./bookingState.logic";

const BORDA: Record<BookingStateSummary["tone"], string> = {
  confirmed: "border-l-success",
  active: "border-l-success",
  completed: "border-l-success",
  pending: "border-l-warning",
  cancelled: "border-l-error",
  neutral: "border-l-muted",
};

/**
 * O estado da reserva em uma frase, logo abaixo do título (02/10/2026). O selo no canto não
 * bastava: "Expirada" miúdo e "O cliente pagou" numa reserva nunca paga. Aqui o status da reserva
 * e o do dinheiro viram título e motivo, com a borda na cor do estado.
 */
export function BookingStateBanner({ state }: { state: BookingStateSummary }) {
  return (
    <div
      role="status"
      data-testid="reserva-estado"
      className={`rounded-md border border-hairline border-l-4 bg-surface p-4 ${BORDA[state.tone]}`}
    >
      <div className="text-title-md text-ink">{state.title}</div>
      {state.detail && <div className="mt-1 text-body-sm text-muted text-pretty">{state.detail}</div>}
    </div>
  );
}
