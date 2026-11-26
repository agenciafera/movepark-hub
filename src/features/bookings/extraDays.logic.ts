/**
 * Dias a mais da reserva (26/11/2026): quanto o balcão cobra de quem sai depois do combinado.
 *
 * A tabela vem da RPC `booking_extra_days_table` (migration 20261208110000): preço de tabela da
 * estadia reservada e de até 30 dias a mais, pela tabela que valia na compra (`price_by_days`) ou,
 * em reserva antiga, pela de hoje. A conta é a da troca de datas de reserva paga (decisão de
 * 17/11/2026): a diferença sai ENTRE AS DURAÇÕES da tabela, nunca do que a reserva pagou, então
 * promoção e cupom da compra não mudam o valor do dia a mais.
 *
 * As diárias da saída real seguem a regra da criação da reserva: blocos de 24h desde a entrada,
 * descontada a tolerância da unidade (`location.tolerance_minutes`).
 */

export type ExtraDaysTable = {
  bookedDays: number;
  toleranceMinutes: number;
  checkInAt: string;
  checkOutAt: string;
  /** "compra": tabela guardada na reserva. "hoje": reserva antiga, tabela atual da unidade. */
  source: "compra" | "hoje";
  /** Preço de tabela por número de diárias. Nulo: a unidade não vende essa duração. */
  prices: Map<number, number | null>;
  /** Maior duração que a tabela cobre. */
  lastDay: number;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Lê a resposta da RPC. Sem fonte ou sem o preço da estadia reservada, não há o que mostrar. */
export function parseExtraDaysTable(raw: unknown): ExtraDaysTable | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const source = r.price_source;
  if (source !== "compra" && source !== "hoje") return null;
  const bookedDays = num(r.booked_days);
  if (!bookedDays || typeof r.check_in_at !== "string" || typeof r.check_out_at !== "string") {
    return null;
  }
  const prices = new Map<number, number | null>();
  const src = (r.prices && typeof r.prices === "object" ? r.prices : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(src)) {
    const d = Number(k);
    if (Number.isInteger(d) && d > 0) prices.set(d, num(v));
  }
  if (prices.get(bookedDays) == null) return null;
  return {
    bookedDays,
    toleranceMinutes: num(r.tolerance_minutes) ?? 0,
    checkInAt: r.check_in_at,
    checkOutAt: r.check_out_at,
    source,
    prices,
    lastDay: Math.max(...prices.keys()),
  };
}

/** Diárias de um período: blocos de 24h desde a entrada, menos a tolerância. Mínimo de 1. */
export function pricingDays(checkInIso: string, endIso: string, toleranceMinutes: number): number {
  const minutos = (new Date(endIso).getTime() - new Date(checkInIso).getTime()) / 60_000;
  return Math.max(1, Math.ceil((minutos - toleranceMinutes) / (60 * 24)));
}

const centavos = (v: number) => Math.round(v * 100);

/** Diferença entre a duração e a reservada, em reais. Estadia maior que custa menos não devolve. */
function chargeFor(t: ExtraDaysTable, total: number | null): number | null {
  const base = t.prices.get(t.bookedDays);
  if (total == null || base == null) return null;
  return Math.max(0, centavos(total) - centavos(base)) / 100;
}

export type ExtraDayRow = {
  /** Dias além do reservado (0 = a própria reserva). */
  extra: number;
  days: number;
  /** Preço de tabela da estadia inteira. */
  total: number | null;
  /** Quanto cobrar a mais. Nulo na linha da reserva e quando a duração não tem preço. */
  charge: number | null;
};

/** A estadia reservada e os `upTo` dias seguintes, até onde a tabela vai. */
export function extraDaysRows(t: ExtraDaysTable, upTo: number): ExtraDayRow[] {
  const rows: ExtraDayRow[] = [];
  for (let extra = 0; extra <= upTo; extra++) {
    const days = t.bookedDays + extra;
    if (days > t.lastDay) break;
    const total = t.prices.get(days) ?? null;
    rows.push({ extra, days, total, charge: extra === 0 ? null : chargeFor(t, total) });
  }
  return rows;
}

export type ExitQuote =
  | { kind: "within"; days: number; extra: 0 }
  | { kind: "charge"; days: number; extra: number; total: number; charge: number }
  | { kind: "no_price"; days: number; extra: number }
  | { kind: "beyond"; days: number; extra: number; lastDay: number };

/** Quanto cobrar para uma saída real. Nulo com data inválida. */
export function quoteExit(t: ExtraDaysTable, exitIso: string): ExitQuote | null {
  if (Number.isNaN(new Date(exitIso).getTime())) return null;
  const days = pricingDays(t.checkInAt, exitIso, t.toleranceMinutes);
  const extra = days - t.bookedDays;
  if (extra <= 0) return { kind: "within", days: t.bookedDays, extra: 0 };
  if (days > t.lastDay) return { kind: "beyond", days, extra, lastDay: t.lastDay };
  const total = t.prices.get(days) ?? null;
  const charge = chargeFor(t, total);
  if (total == null || charge == null) return { kind: "no_price", days, extra };
  return { kind: "charge", days, extra, total, charge };
}
