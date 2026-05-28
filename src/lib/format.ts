import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatBRL(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return brl.format(value);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return format(new Date(value), "dd/MM/yyyy", { locale: ptBR });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return format(new Date(value), "dd/MM/yyyy HH:mm", { locale: ptBR });
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return format(new Date(value), "HH:mm", { locale: ptBR });
}

export function daysBetween(start: string | Date, end: string | Date): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return Math.max(1, Math.ceil((e - s) / (1000 * 60 * 60 * 24)));
}
