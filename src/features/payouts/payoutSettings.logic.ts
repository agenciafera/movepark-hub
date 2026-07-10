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

/**
 * Dias "seguros" pra recebimento mensal — estilo vencimento de cartão. Todos ≤28, pra existirem em
 * TODO mês (nada de 29/30/31, que quebram em fevereiro e em meses de 30 dias).
 */
export const MONTHLY_DAYS = [1, 5, 10, 15, 20, 25, 28];

/** Opções de dia para o intervalo; null = campo não se aplica (Daily). */
export function dayOptions(interval: TransferInterval): number[] | null {
  if (interval === "Daily") return null;
  if (interval === "Weekly") return [1, 2, 3, 4, 5];
  return MONTHLY_DAYS;
}

/** Snapa o dia pra uma opção válida do intervalo (Daily→0, Weekly→1–5, Monthly→dia seguro). */
export function coerceDay(interval: TransferInterval, day: number): number {
  if (interval === "Daily") return 0;
  if (interval === "Weekly") return Math.min(5, Math.max(1, day || 1));
  // Monthly: se não for um dia seguro, cai no mais próximo (ex.: 31 → 28, 0 → 1).
  if (MONTHLY_DAYS.includes(day)) return day;
  return MONTHLY_DAYS.reduce(
    (best, d) => (Math.abs(d - day) < Math.abs(best - day) ? d : best),
    MONTHLY_DAYS[0],
  );
}

/** Descrição amigável do dia por intervalo (pra exibição). */
export function intervalDayLabel(interval: TransferInterval, day: number): string {
  if (interval === "Daily") return "todo dia útil";
  if (interval === "Weekly") return WEEKDAY_LABELS[day - 1] ?? `dia ${day}`;
  return `dia ${day} do mês`;
}
