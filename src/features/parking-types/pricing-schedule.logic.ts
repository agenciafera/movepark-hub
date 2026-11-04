import { formatDate } from "@/lib/format";
import type { PricingSchedule } from "@/types/domain";

/** "Agora" grava a tabela na hora; "scheduled" programa para uma data (vigência pela compra). */
export type ScheduleMode = "now" | "scheduled";

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Primeiro dia que dá para programar: amanhã. Para hoje, o parceiro salva sem agendar. */
export function minScheduleDate(today: Date = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  return toIsoDate(d);
}

/** Por que o agendamento ainda não pode ser salvo, ou null. O servidor confere de novo. */
export function whyCannotSchedule(
  mode: ScheduleMode,
  date: string | null,
  today: Date = new Date(),
): string | null {
  if (mode === "now") return null;
  if (!date) return "Escolha o dia em que a tabela nova passa a valer.";
  if (date < minScheduleDate(today)) return "A data precisa ser a partir de amanhã.";
  return null;
}

export function saveLabel(mode: ScheduleMode, date: string | null): string {
  if (mode === "scheduled" && date) return `Programar para ${formatDate(date)}`;
  if (mode === "scheduled") return "Programar tabela";
  return "Salvar precificação";
}

/** O que o card mostra: o que ainda vai entrar e o que falhou, na ordem da data. */
export function visibleSchedules(list: PricingSchedule[]): PricingSchedule[] {
  return list
    .filter((s) => s.status === "scheduled" || s.status === "failed")
    .sort((a, b) => a.effective_date.localeCompare(b.effective_date));
}
