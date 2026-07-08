import { differenceInCalendarDays, format } from "date-fns";
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

/**
 * Data + hora compacta, sem ano: `8 jul · 22:00`. Para listas onde o ano é ruído
 * (o viajante quer dia e horário, não a data por extenso). Remove o ponto que o
 * locale ptBR adiciona no mês abreviado (`jul.` → `jul`).
 */
export function formatDayTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return format(new Date(value), "d MMM · HH:mm", { locale: ptBR }).replace(/\./g, "");
}

/**
 * Pista de proximidade humana a partir de uma data: `hoje`, `amanhã`, `ontem`,
 * `em 3 dias`, `há 5 dias`. Fora de uma janela de ~30 dias retorna `null` (evita
 * "em 340 dias"). `now` é injetável para testes.
 */
export function formatRelativeDay(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!value) return null;
  const diff = differenceInCalendarDays(new Date(value), now);
  if (diff === 0) return "hoje";
  if (diff === 1) return "amanhã";
  if (diff === -1) return "ontem";
  if (diff > 1 && diff <= 30) return `em ${diff} dias`;
  if (diff < -1 && diff >= -30) return `há ${-diff} dias`;
  return null;
}

export function daysBetween(start: string | Date, end: string | Date): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return Math.max(1, Math.ceil((e - s) / (1000 * 60 * 60 * 24)));
}

const km1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** Distância em km humanizada. `0,4 km` ou `400 m`. */
export function formatDistance(km: number | null | undefined): string {
  if (km === null || km === undefined || Number.isNaN(km)) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km1.format(km)} km`;
}

/** Duração humana entre check-in e check-out: `5 dias` ou `2 dias e 4h`. */
export function formatDuration(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined,
): string {
  if (!start || !end) return "—";
  const totalMs = new Date(end).getTime() - new Date(start).getTime();
  if (totalMs <= 0) return "—";
  const totalH = Math.floor(totalMs / (1000 * 60 * 60));
  const days = Math.floor(totalH / 24);
  const hours = totalH % 24;
  if (days === 0) return hours === 1 ? "1 hora" : `${hours} horas`;
  const dPart = days === 1 ? "1 dia" : `${days} dias`;
  if (hours === 0) return dPart;
  return `${dPart} e ${hours}h`;
}

const rating1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

/** Rating com vírgula decimal (padrão BR): `4,81`. */
export function formatRating(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return rating1.format(value);
}
