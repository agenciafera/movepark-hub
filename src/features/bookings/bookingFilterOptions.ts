/**
 * Opções dos filtros da lista de reservas, iguais no Manager e no Operator (13/10/2026). Valem para
 * as duas origens: no site, a forma de pagamento sai do código da forma de pagamento do pedido e o
 * comparecimento do que o site registrou.
 */
import type { PaymentMethodFilter } from "./bookingList.logic";

export const PAYMENT_OPTIONS: { value: PaymentMethodFilter | "all"; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "pix", label: "PIX" },
  { value: "card", label: "Cartão de crédito" },
  { value: "none", label: "Sem pagamento" },
];

export type AttendanceFilter = "all" | "compareceu" | "no_show" | "pendente";

export const ATTENDANCE_OPTIONS: { value: AttendanceFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "compareceu", label: "Chegou" },
  { value: "pendente", label: "Ainda não chegou" },
  { value: "no_show", label: "Não veio" },
];

export type PcdFilter = "all" | "sim" | "nao";

export const PCD_OPTIONS: { value: PcdFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "sim", label: "Com PCD" },
  { value: "nao", label: "Sem PCD" },
];

export function pcdParam(v: string): boolean | undefined {
  return v === "sim" ? true : v === "nao" ? false : undefined;
}

export function attendanceParam(v: string): "compareceu" | "no_show" | "pendente" | undefined {
  return v === "compareceu" || v === "no_show" || v === "pendente" ? v : undefined;
}
