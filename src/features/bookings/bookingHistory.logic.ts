/**
 * Linha do tempo da reserva do Hub (fase 6 das reservas unificadas, 09/10/2026), com quem fez, como
 * a do site. Junta o que a tela já mostrava (criada, paga, recusada, check-in/out, cancelada) com
 * o histórico de `booking_modification` (RPC `booking_history`). Quando o histórico tem a marcação
 * (check-in, check-out, cancelamento), ela substitui a linha genérica, para não aparecer duas vezes.
 */
export type BookingHistoryEntry = {
  id: string;
  type: "cancel" | "date_change" | "vehicle_change" | "fare_upgrade" | "refund" | "status_change" | string;
  created_at: string;
  actor_role: "customer" | "staff" | "system" | string;
  actor_name: string | null;
  changes: Record<string, unknown> | null;
  amount_delta_cents: number | null;
  reason: string | null;
};

export type TimelineEntry = { at: string; text: string; tone: "muted" | "error" };

type Basics = {
  created_at: string;
  status: string;
  updated_at: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  paid_at: string | null;
  payment_method: string | null;
  payment_failed_at: string | null;
};

type Fmt = { dateTime: (v: string) => string; brl: (v: number) => string };

function statusText(to: string): string {
  if (to === "checked_in") return "Check-in";
  if (to === "completed") return "Check-out";
  if (to === "no_show") return "Marcada como não compareceu";
  return `Status: ${to}`;
}

function quem(e: BookingHistoryEntry): string {
  if (e.actor_name) return ` por ${e.actor_name}`;
  if (e.actor_role === "system") return " (automático)";
  return "";
}

export function historyText(e: BookingHistoryEntry, fmt: Fmt): string {
  const ch = (e.changes ?? {}) as Record<string, Record<string, Record<string, unknown> | unknown>>;
  let t: string;
  switch (e.type) {
    case "status_change":
      t = statusText(String((ch.status as Record<string, unknown> | undefined)?.to ?? ""));
      break;
    case "cancel":
      t = "Cancelada";
      break;
    case "date_change": {
      const to = ch.to as Record<string, unknown> | undefined;
      t =
        to?.check_in_at && to?.check_out_at
          ? `Datas alteradas para ${fmt.dateTime(String(to.check_in_at))} até ${fmt.dateTime(String(to.check_out_at))}`
          : "Datas alteradas";
      break;
    }
    case "vehicle_change": {
      const from = ch.from as Record<string, unknown> | undefined;
      const to = ch.to as Record<string, unknown> | undefined;
      t =
        from?.license_plate && to?.license_plate
          ? `Placa trocada de ${from.license_plate} para ${to.license_plate}`
          : "Veículo trocado";
      break;
    }
    case "refund":
      t = "Estorno";
      break;
    case "fare_upgrade":
      t = "Plano alterado";
      break;
    default:
      t = e.type;
  }
  if (e.amount_delta_cents) {
    const v = fmt.brl(Math.abs(e.amount_delta_cents) / 100);
    t += e.amount_delta_cents < 0 ? ` (devolvido ${v})` : ` (cobrado ${v})`;
  }
  if (e.reason) t += `: ${e.reason}`;
  return t + quem(e);
}

export function buildHubTimeline(b: Basics, history: BookingHistoryEntry[], fmt: Fmt): TimelineEntry[] {
  const statusTo = (e: BookingHistoryEntry) =>
    e.type === "status_change" ? String(((e.changes ?? {}).status as Record<string, unknown> | undefined)?.to ?? "") : "";
  const temCheckin = history.some((e) => statusTo(e) === "checked_in");
  const temCheckout = history.some((e) => statusTo(e) === "completed");
  const temCancel = history.some((e) => e.type === "cancel");

  const out: TimelineEntry[] = [{ at: b.created_at, text: "Criada", tone: "muted" }];
  if (b.paid_at) out.push({ at: b.paid_at, text: `Paga${b.payment_method ? ` (${b.payment_method})` : ""}`, tone: "muted" });
  if (b.payment_failed_at) out.push({ at: b.payment_failed_at, text: "Pagamento recusado", tone: "error" });
  if (b.checked_in_at && !temCheckin) out.push({ at: b.checked_in_at, text: "Check-in", tone: "muted" });
  if (b.checked_out_at && !temCheckout) out.push({ at: b.checked_out_at, text: "Check-out", tone: "muted" });
  if (b.status === "cancelled" && !temCancel) out.push({ at: b.updated_at, text: "Cancelada", tone: "error" });
  for (const e of history) {
    out.push({ at: e.created_at, text: historyText(e, fmt), tone: e.type === "cancel" ? "error" : "muted" });
  }
  return out.sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
}
