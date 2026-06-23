// Lógica pura da reconciliação WL→Hub (E2.5.2) — testável sem rede.
import type { WlAvailabilityDay } from "../_shared/wl/client.ts";

/** Linhas pra wl_reconcile_apply: external_booked_count = sold_wl (vendas próprias do WL) por dia. */
export function buildReconcileRows(days: WlAvailabilityDay[]): { date: string; external: number }[] {
  return (days ?? [])
    .filter((d) => d.date)
    .map((d) => ({ date: d.date, external: Math.max(0, Number(d.sold_wl ?? 0)) }));
}

/** Janela de reconciliação (hoje .. hoje+N) em YYYY-MM-DD (UTC). */
export function reconcileWindow(today: Date, daysAhead = 90): { start: string; end: string } {
  const iso = (dt: Date) => dt.toISOString().slice(0, 10);
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + daysAhead);
  return { start: iso(today), end: iso(end) };
}
