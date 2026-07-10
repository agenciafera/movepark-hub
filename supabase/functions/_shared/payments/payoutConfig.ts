// E0.3.3 · Resolve a config EFETIVA de repasse de um recebedor: coluna da empresa ?? default global
// (app_setting) ?? hardcoded. Lógica pura (testável) usada no create (sync-recipient) e no update.

import type { AnticipationSettings, TransferSettings } from "./types.ts";

/** Colunas de config no payout_recipient (null = herda o global). */
export interface RecipientConfigRow {
  transfer_enabled: boolean | null;
  transfer_interval: string | null;
  transfer_day: number | null;
  anticipation_enabled: boolean | null;
  anticipation_type: string | null;
  anticipation_volume_percentage: number | null;
  anticipation_delay: number | null;
  anticipation_days: number[] | null;
}

/** app_setting global: key → value (string). */
export type GlobalSettings = Record<string, string | null | undefined>;

export const TRANSFER_INTERVALS = ["Daily", "Weekly", "Monthly"] as const;
export const ANTICIPATION_TYPES = ["full", "1025"] as const;

const HARD_TRANSFER: TransferSettings = { enabled: true, interval: "Daily", day: 0 };
const HARD_ANTICIPATION: AnticipationSettings = {
  enabled: false,
  type: "full",
  volumePercentage: 100,
  delay: null,
  days: null,
};

function toBool(v: unknown, fb: boolean): boolean {
  if (v == null || v === "") return fb;
  if (typeof v === "boolean") return v;
  return String(v).toLowerCase() !== "false";
}
function toInt(v: unknown, fb: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fb;
}
/** "daily" → "Daily" (a Pagar.me espera capitalizado). */
export function capInterval(s: string): string {
  const v = String(s ?? "").toLowerCase();
  return v.charAt(0).toUpperCase() + v.slice(1);
}
export function isValidInterval(s: unknown): s is (typeof TRANSFER_INTERVALS)[number] {
  return TRANSFER_INTERVALS.includes(s as (typeof TRANSFER_INTERVALS)[number]);
}
export function isValidAnticipationType(s: unknown): boolean {
  return ANTICIPATION_TYPES.includes(s as (typeof ANTICIPATION_TYPES)[number]);
}
/** Ajusta/valida o dia pra faixa do intervalo (Daily=0, Weekly 1–5, Monthly 1–31). */
export function normalizeTransferDay(interval: string, day: number): number {
  if (interval === "Daily") return 0;
  if (interval === "Weekly") return Math.min(5, Math.max(1, day || 1));
  return Math.min(31, Math.max(1, day || 1));
}
export function isValidTransferDay(interval: string, day: number): boolean {
  if (interval === "Daily") return day === 0;
  if (interval === "Weekly") return day >= 1 && day <= 5;
  if (interval === "Monthly") return day >= 1 && day <= 31;
  return false;
}
export function clampVolume(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

function parseDays(raw: string | null | undefined): number[] | null {
  if (!raw || !raw.trim()) return null;
  const arr = raw.split(",").map((s) => Math.round(Number(s.trim()))).filter((n) => n >= 1 && n <= 31);
  return arr.length ? arr : null;
}

/** Cadência efetiva (coluna da empresa ?? global ?? hard). */
export function resolveTransfer(row: RecipientConfigRow | null, g: GlobalSettings): TransferSettings {
  const interval = row?.transfer_interval
    ?? (g.payout_transfer_interval ? capInterval(g.payout_transfer_interval) : HARD_TRANSFER.interval);
  const enabled = row?.transfer_enabled ?? toBool(g.payout_transfer_enabled, HARD_TRANSFER.enabled);
  const day = row?.transfer_day ?? toInt(g.payout_transfer_day, HARD_TRANSFER.day);
  return { enabled, interval, day: normalizeTransferDay(interval, day) };
}

/** Antecipação efetiva (coluna da empresa ?? global ?? hard). */
export function resolveAnticipation(
  row: RecipientConfigRow | null,
  g: GlobalSettings,
): AnticipationSettings {
  const enabled = row?.anticipation_enabled ?? toBool(g.payout_anticipation_enabled, HARD_ANTICIPATION.enabled);
  const type = row?.anticipation_type ?? (g.payout_anticipation_type || HARD_ANTICIPATION.type);
  const volumePercentage = clampVolume(
    row?.anticipation_volume_percentage
      ?? toInt(g.payout_anticipation_volume_percentage, HARD_ANTICIPATION.volumePercentage),
  );
  const delay = row?.anticipation_delay
    ?? (g.payout_anticipation_delay ? toInt(g.payout_anticipation_delay, 0) : null);
  const days = row?.anticipation_days ?? parseDays(g.payout_anticipation_days);
  return { enabled, type, volumePercentage, delay, days };
}
