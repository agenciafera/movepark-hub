import { formatDate } from "@/lib/format";

export type MinStayUnit = "minutes" | "hours" | "days" | "months";

/** Retorno mapeado da RPC `check_availability`. */
export type AvailabilityCheck = {
  ok: boolean;
  capacity: number;
  remaining: number;
  sold_out: boolean;
  near_capacity: boolean;
  near_capacity_message: string | null;
  min_stay_ok: boolean;
  min_stay_value: number | null;
  min_stay_unit: MinStayUnit | null;
  min_date_ok: boolean;
  minimum_date: string | null;
  advance_ok: boolean;
  advance_minutes: number | null;
  past_ok: boolean;
  days: number;
  reasons: string[];
  error?: string | null;
};

export type AvailabilityUi = {
  /** Se a reserva é permitida pela disponibilidade/regras (neutro quando não há dados). */
  canReserve: boolean;
  /** Texto a exibir (bloqueio ou aviso); null quando nada a dizer. */
  message: string | null;
  tone: "error" | "warning" | null;
};

function minStayLabel(value: number, unit: MinStayUnit): string {
  const plural = value !== 1;
  switch (unit) {
    case "minutes":
      return `${value} ${plural ? "minutos" : "minuto"}`;
    case "hours":
      return `${value} ${plural ? "horas" : "hora"}`;
    case "days":
      return `${value} ${plural ? "diárias" : "diária"}`;
    case "months":
      return `${value} ${plural ? "meses" : "mês"}`;
  }
}

/**
 * Traduz o resultado de `check_availability` para o que a UI mostra.
 * Quando não há dados (período não escolhido / carregando / erro de resolução),
 * é neutro — não bloqueia, deixando o `create_booking_atomic` ser a autoridade final.
 */
export function availabilityUi(a: AvailabilityCheck | null | undefined): AvailabilityUi {
  if (!a || a.error) return { canReserve: true, message: null, tone: null };

  if (!a.past_ok) {
    return {
      canReserve: false,
      message: "A data e o horário de entrada precisam ser futuros.",
      tone: "error",
    };
  }
  if (a.sold_out) {
    return { canReserve: false, message: "Esgotado pro seu período.", tone: "error" };
  }
  if (!a.min_stay_ok && a.min_stay_value != null && a.min_stay_unit != null) {
    return {
      canReserve: false,
      message: `Essa vaga exige reserva mínima de ${minStayLabel(a.min_stay_value, a.min_stay_unit)}.`,
      tone: "error",
    };
  }
  if (!a.min_date_ok && a.minimum_date) {
    return {
      canReserve: false,
      message: `Reservas para essa vaga começam a partir de ${formatDate(a.minimum_date)}.`,
      tone: "error",
    };
  }
  if (!a.advance_ok && a.advance_minutes != null) {
    return {
      canReserve: false,
      message: `Reservas precisam de pelo menos ${a.advance_minutes} min de antecedência.`,
      tone: "error",
    };
  }
  if (a.near_capacity) {
    const msg =
      a.remaining > 0
        ? `Faltam ${a.remaining} vaga${a.remaining === 1 ? "" : "s"} para esse período.`
        : (a.near_capacity_message ?? "Restam poucas vagas para esse período.");
    return { canReserve: true, message: msg, tone: "warning" };
  }
  return { canReserve: true, message: null, tone: null };
}
