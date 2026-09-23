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

/** Janela de acionamento da proteção de voo: até 120 min depois da saída prevista (Q-025). */
export const FLIGHT_EXTENSION_AFTER_CHECKOUT_MINUTES = 120;
/** Quanto a proteção estende, no máximo (Q-025). */
export const FLIGHT_EXTENSION_MAX_HOURS = 24;

/**
 * "Meu voo atrasou" aparece para Superflex confirmada ou em uso, uma vez por reserva, até 120
 * min depois da saída prevista. O servidor (RPC) confere tudo de novo.
 */
export function canCustomerExtendFlight(
  benefits: FareBenefits | null | undefined,
  status: string,
  checkOutAt: string | Date,
  extensionsUsed: number,
  now: Date,
): boolean {
  if (benefits?.flight_delay_protection !== true) return false;
  if (status !== "confirmed" && status !== "checked_in") return false;
  if (extensionsUsed > 0) return false;
  const limite = new Date(checkOutAt).getTime() + FLIGHT_EXTENSION_AFTER_CHECKOUT_MINUTES * 60_000;
  return now.getTime() <= limite;
}
