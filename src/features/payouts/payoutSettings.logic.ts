// E0.3.3 · Lógica pura da UI de configuração de repasse (cadência de transferência por empresa).
// Espelha as regras do servidor (payoutConfig / CHECK da migration): dia válido por intervalo.

export const TRANSFER_INTERVALS = ["Daily", "Weekly", "Monthly"] as const;
export type TransferInterval = (typeof TRANSFER_INTERVALS)[number];

export const INTERVAL_LABELS: Record<TransferInterval, string> = {
  Daily: "Diário",
  Weekly: "Semanal",
  Monthly: "Mensal",
};

/** Rótulos dos dias da semana (transfer_day 1–5 = seg–sex na Pagar.me). */
export const WEEKDAY_LABELS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

/** Opções de dia para o intervalo; null = campo não se aplica (Daily). */
export function dayOptions(interval: TransferInterval): number[] | null {
  if (interval === "Daily") return null;
  if (interval === "Weekly") return [1, 2, 3, 4, 5];
  return Array.from({ length: 31 }, (_, i) => i + 1); // Monthly 1–31
}

/** Ajusta o dia ao trocar o intervalo (Daily→0, Weekly→1–5, Monthly→1–31). */
export function coerceDay(interval: TransferInterval, day: number): number {
  if (interval === "Daily") return 0;
  if (interval === "Weekly") return Math.min(5, Math.max(1, day || 1));
  return Math.min(31, Math.max(1, day || 1));
}

/** Descrição amigável do dia por intervalo (pra exibição). */
export function intervalDayLabel(interval: TransferInterval, day: number): string {
  if (interval === "Daily") return "todo dia útil";
  if (interval === "Weekly") return WEEKDAY_LABELS[day - 1] ?? `dia ${day}`;
  return `dia ${day} do mês`;
}
