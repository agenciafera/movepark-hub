// Gates puros das ALTERAÇÕES de reserva do cliente, amarrados ao benefício da Tarifa (E2.8).
// Espelham o enforcement do servidor (Edges cancel-booking / change-booking-dates /
// change-booking-vehicle) e são a fonte única do que a tela do cliente oferece. A VERDADE é sempre
// o servidor; aqui é o espelho para não oferecer ação que a Edge vai recusar.
// Matriz por tier em docs/specs/booking-modifications.md (travada por teste).

import type { FareBenefits } from "@/lib/fares";
import { customerSelfCancel, type SelfCancelGate } from "./cancellation.logic";

export { customerSelfCancel };
export type { SelfCancelGate };

/** true se o check-in ainda não passou (alteração só faz sentido antes de a estadia começar). */
function beforeCheckIn(checkInAt: string | Date, now: Date): boolean {
  return new Date(checkInAt).getTime() > now.getTime();
}

/**
 * Trocar datas: benefício `date_change` (Flex+; Básica não tem), reserva ainda PENDENTE e antes do
 * check-in. Reserva paga é recusada pela RPC (re-precifica só o hold) — por isso o gate exige `pending`.
 */
export function canCustomerChangeDates(
  benefits: FareBenefits | null | undefined,
  status: string,
  checkInAt: string | Date,
  now: Date,
): boolean {
  return benefits?.date_change === true && status === "pending" && beforeCheckIn(checkInAt, now);
}

/**
 * Trocar datas de uma reserva PAGA (E2.8-h, Fase B): benefício `date_change`, reserva CONFIRMED e
 * antes do check-in. Diferente de `canCustomerChangeDates` (pending): aqui há re-preço com cobrança
 * ou estorno da diferença, pela Edge change-booking-dates-paid.
 */
export function canCustomerChangePaidDates(
  benefits: FareBenefits | null | undefined,
  status: string,
  checkInAt: string | Date,
  now: Date,
): boolean {
  return benefits?.date_change === true && status === "confirmed" && beforeCheckIn(checkInAt, now);
}

/**
 * Trocar veículo/placa: benefício `plate_change` (Flex+; Básica não tem), reserva pending/confirmed
 * e antes do check-in.
 */
export function canCustomerChangeVehicle(
  benefits: FareBenefits | null | undefined,
  status: string,
  checkInAt: string | Date,
  now: Date,
): boolean {
  return (
    benefits?.plate_change === true &&
    (status === "pending" || status === "confirmed") &&
    beforeCheckIn(checkInAt, now)
  );
}
