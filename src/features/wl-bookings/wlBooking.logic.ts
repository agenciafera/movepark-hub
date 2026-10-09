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

export type WlTimelineEntry = { at: string | null; text: string; tone: "muted" | "error" };

type TimelineInput = {
  wl_created_at: string | null;
  synced_at: string;
  attendance_status: string | null;
  attendance_marked_at: string | null;
  actions: { action: string; request: Record<string, unknown> | null; result: string; message: string | null; by_name: string | null; created_at: string }[];
  site_events?: { kind: string; occurred_at: string | null; actor: string | null; note: string | null }[];
};

/**
 * A linha do tempo da reserva do site (fase 4, 09/10/2026), em ordem cronológica.
 *
 * A fonte é o histórico copiado do site, que já registra o que o Hub gravou lá (o legado anota
 * "Placa alterada ... (Movepark Hub: Fulano)"). Do log de ações do Hub entra só o que o histórico
 * ainda não tem: tentativa que não gravou e ação posterior à última cópia. Assim nada aparece duas
 * vezes. Sem histórico copiado (antes da releitura), cai no que havia antes: compra, ações do Hub
 * e o comparecimento marcado no site.
 */
export function buildWlTimeline(b: TimelineInput): WlTimelineEntry[] {
  const out: WlTimelineEntry[] = [{ at: b.wl_created_at, text: "Comprada no site", tone: "muted" }];
  const history = (b.site_events ?? []).filter((e) => e.kind === "history" && e.note);
  const temHistorico = history.length > 0;
  const copiadoAte = new Date(b.synced_at).getTime();

  for (const e of history) {
    out.push({ at: e.occurred_at, text: `${e.note}${e.actor ? ` (${e.actor})` : ""}`, tone: "muted" });
  }
  for (const a of b.actions) {
    const depoisDaCopia = new Date(a.created_at).getTime() > copiadoAte;
    if (temHistorico && a.result === "ok" && !depoisDaCopia) continue;
    out.push({ at: a.created_at, text: wlActionTimelineLabel(a), tone: a.result === "ok" ? "muted" : "error" });
  }
  if (!temHistorico && b.attendance_marked_at && !b.actions.some((a) => a.action === "attendance")) {
    out.push({ at: b.attendance_marked_at, text: `${attendanceLabel(b.attendance_status)} (marcado no site)`, tone: "muted" });
  }
  return out.sort((x, y) => (x.at ? new Date(x.at).getTime() : 0) - (y.at ? new Date(y.at).getTime() : 0));
}

/**
 * Forma de pagamento do site como o parceiro lê: o legado nomeia o meio junto com o gateway
 * ("Cartão de crédito - Pagarme V5", "PIX - Pagarme V5"), e o gateway não diz nada a quem opera.
 */
export function wlPaymentMethodLabel(name: string | null | undefined): string | null {
  if (!name) return null;
  return name.split(" - ")[0].trim() || name;
}
