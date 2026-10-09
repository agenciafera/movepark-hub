/**
 * Receita por dia com as duas origens (reservas-unificadas-hub-wl.md § 6, fase 5): o Hub, na base
 * que cada tela já usa (total no Manager, diárias no Operator), e o pago no site white-label.
 * `total` é a soma, para o "melhor dia" e o total do período falarem da receita inteira.
 */
export type DailyByOrigin = { date: string; hub: number; wl: number; total: number };

const round2 = (v: number) => Math.round(v * 100) / 100;

export function mergeDailyByOrigin(
  hub: { date: string; value: number }[],
  wl: { day: string; paid_amount: number }[],
): DailyByOrigin[] {
  const map = new Map<string, DailyByOrigin>();
  const get = (date: string) => {
    const d = map.get(date) ?? { date, hub: 0, wl: 0, total: 0 };
    map.set(date, d);
    return d;
  };
  for (const h of hub) get(h.date).hub += h.value;
  for (const w of wl) get(w.day).wl += w.paid_amount;
  return Array.from(map.values())
    .map((d) => ({ ...d, hub: round2(d.hub), wl: round2(d.wl), total: round2(d.hub + d.wl) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** "R$ X no Hub, R$ Y no white-label", só quando o site vendeu algo no recorte. */
export function originBreakdown(hub: number, wl: number, brl: (v: number) => string): string | null {
  return wl > 0 ? `${brl(hub)} no Hub, ${brl(wl)} no white-label` : null;
}
