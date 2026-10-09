/**
 * Rótulos das reservas feitas no site do parceiro (aba "Pelo seu site" em Reservas).
 *
 * O status vem do legado já traduzido para o vocabulário do Hub (`wl_booking_status` no banco);
 * aqui é só como ele aparece. Spec: docs/specs/reservas-wl-no-hub.md § 9.
 */
import type { WlBookingStatus } from "@/types/domain";

type BadgeTone = "confirmed" | "pending" | "cancelled" | "completed" | "noshow" | "neutral";

export const WL_BOOKING_STATUS_LABEL: Record<WlBookingStatus, string> = {
  pending: "Aguardando pagamento",
  confirmed: "Paga",
  cancelled: "Cancelada",
  expired: "Expirada",
  refund_requested: "Reembolso pedido",
  refunded: "Reembolsada",
  unknown: "Outro",
};

export const WL_BOOKING_STATUS_TONE: Record<WlBookingStatus, BadgeTone> = {
  pending: "pending",
  confirmed: "confirmed",
  cancelled: "cancelled",
  expired: "neutral",
  refund_requested: "pending",
  refunded: "cancelled",
  unknown: "neutral",
};

export function wlBookingStatusLabel(status: string | null | undefined): string {
  return WL_BOOKING_STATUS_LABEL[(status ?? "unknown") as WlBookingStatus] ?? "Outro";
}

export function wlBookingStatusTone(status: string | null | undefined): BadgeTone {
  return WL_BOOKING_STATUS_TONE[(status ?? "unknown") as WlBookingStatus] ?? "neutral";
}

/** Comparecimento como o backoffice do site registra (`pendente`, `compareceu`, `no_show`). */
export function attendanceLabel(value: string | null | undefined): string {
  if (value === "compareceu") return "Compareceu";
  if (value === "no_show") return "Não compareceu";
  return "Ainda não marcado";
}

/** Valor em reais a partir de centavos; nulo vira traço. */
export function centsToReais(cents: number | null | undefined): number | null {
  return cents === null || cents === undefined ? null : cents / 100;
}

export const WL_BOOKING_STATUS_OPTIONS: { value: WlBookingStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "confirmed", label: WL_BOOKING_STATUS_LABEL.confirmed },
  { value: "pending", label: WL_BOOKING_STATUS_LABEL.pending },
  { value: "cancelled", label: WL_BOOKING_STATUS_LABEL.cancelled },
  { value: "refunded", label: WL_BOOKING_STATUS_LABEL.refunded },
  { value: "expired", label: WL_BOOKING_STATUS_LABEL.expired },
];

/**
 * "Cliente chegou" só a partir do horário de entrada: o site recusa antes disso
 * (`before_checkin`), então a tela nem oferece. Sem horário, deixa o site decidir.
 */
export function canMarkArrived(checkInAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!checkInAt) return true;
  const t = new Date(checkInAt).getTime();
  return !Number.isFinite(t) || t <= now.getTime();
}

/**
 * Uma ação do Hub na linha do tempo da reserva do site: o que foi feito, por quem e, se o site
 * recusou, o motivo. O texto do motivo é o que o site devolveu (já em português).
 */
export function wlActionTimelineLabel(a: {
  action: string;
  request: Record<string, unknown> | null;
  result: string;
  message: string | null;
  by_name: string | null;
}): string {
  const req = a.request ?? {};
  let texto: string;
  if (a.action === "attendance") {
    const st = String(req.status ?? "");
    texto =
      st === "compareceu" ? "Chegada registrada"
      : st === "no_show" ? "Marcada como não compareceu"
      : "Marcação de comparecimento desfeita";
  } else if (a.action === "license_plate") {
    const placa = req.license_plate ? String(req.license_plate).toUpperCase() : null;
    const motivo = req.reason ? String(req.reason) : null;
    texto = `Placa trocada${placa ? ` para ${placa}` : ""}${motivo ? ` (${motivo})` : ""}`;
  } else {
    texto = a.action;
  }
  if (a.by_name) texto += ` por ${a.by_name}`;
  // Tentativa que não gravou não pode soar como fato consumado.
  if (a.result !== "ok") texto = `Não gravou: ${texto.charAt(0).toLowerCase()}${texto.slice(1)}`;
  if (a.result === "refused") texto += `. O site recusou${a.message ? `: ${a.message}` : ""}`;
  if (a.result === "error") texto += `. Não chegou ao site${a.message ? `: ${a.message}` : ""}`;
  return texto;
}
