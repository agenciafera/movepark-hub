/**
 * Lógica pura dos filtros do Manager: período (com comparação) e unidade.
 * Sem React, sem Supabase, pra ser testável e usada igual em toda página do painel.
 *
 * Convenção do intervalo: `from` é inclusivo e `to` é EXCLUSIVO (`>= from` e `< to`),
 * a mesma leitura das RPCs. Com isso "hoje" é do 00:00 de hoje ao 00:00 de amanhã e
 * nenhuma reserva das 23h fica de fora por causa de um `<=` mal resolvido.
 *
 * A semana começa na segunda: o painel lê operação, e a semana de trabalho fecha
 * de segunda a domingo.
 */

import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  startOfYear,
  addDays,
  addWeeks,
  addMonths,
  addYears,
  subDays,
  subWeeks,
  subMonths,
  subYears,
  format,
  isSameDay,
  isSameMonth,
  isSameYear,
} from "date-fns";
import { ptBR } from "date-fns/locale";

export type PeriodPreset =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "last7"
  | "thisMonth"
  | "lastMonth"
  | "last30"
  | "last90"
  | "thisYear"
  | "lastYear"
  | "custom";

export type ComparePreset = "none" | "previous" | "lastYear" | "custom";

/** Intervalo resolvido: `from` inclusivo, `to` exclusivo. */
export type Range = { from: Date; to: Date };

export type PeriodState = {
  preset: PeriodPreset;
  /** Só quando `preset === "custom"`: dia inicial e dia final, ambos inclusivos na UI. */
  customFrom: string | null;
  customTo: string | null;
  compare: ComparePreset;
  /** Só quando `compare === "custom"`. */
  compareFrom: string | null;
  compareTo: string | null;
};

export const DEFAULT_PERIOD: PeriodState = {
  preset: "last30",
  customFrom: null,
  customTo: null,
  compare: "previous",
  compareFrom: null,
  compareTo: null,
};

/** Opções do menu, na ordem em que aparecem, agrupadas por horizonte. */
export const PERIOD_OPTIONS: { value: PeriodPreset; label: string; group: string }[] = [
  { value: "today", label: "Hoje", group: "Dia" },
  { value: "yesterday", label: "Ontem", group: "Dia" },
  { value: "thisWeek", label: "Esta semana", group: "Semana" },
  { value: "lastWeek", label: "Semana passada", group: "Semana" },
  { value: "last7", label: "Últimos 7 dias", group: "Semana" },
  { value: "thisMonth", label: "Este mês", group: "Mês" },
  { value: "lastMonth", label: "Mês passado", group: "Mês" },
  { value: "last30", label: "Últimos 30 dias", group: "Mês" },
  { value: "last90", label: "Últimos 90 dias", group: "Ano" },
  { value: "thisYear", label: "Este ano", group: "Ano" },
  { value: "lastYear", label: "Ano passado", group: "Ano" },
  { value: "custom", label: "Personalizado", group: "Ano" },
];

export const COMPARE_OPTIONS: { value: ComparePreset; label: string }[] = [
  { value: "previous", label: "Período anterior" },
  { value: "lastYear", label: "Mesmo período do ano passado" },
  { value: "custom", label: "Período escolhido por mim" },
  { value: "none", label: "Sem comparação" },
];

const parseDay = (iso: string | null): Date | null => {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const toDayString = (d: Date): string => format(d, "yyyy-MM-dd");

/**
 * Resolve o preset num intervalo real. `now` entra por parâmetro pra o teste não
 * depender do relógio. Um `custom` sem as duas pontas cai no default (últimos 30).
 */
export function resolvePeriod(state: PeriodState, now = new Date()): Range {
  const today = startOfDay(now);
  const week = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });

  switch (state.preset) {
    case "today":
      return { from: today, to: addDays(today, 1) };
    case "yesterday":
      return { from: subDays(today, 1), to: today };
    case "thisWeek":
      return { from: week(today), to: addWeeks(week(today), 1) };
    case "lastWeek":
      return { from: subWeeks(week(today), 1), to: week(today) };
    case "last7":
      return { from: subDays(today, 6), to: addDays(today, 1) };
    case "thisMonth":
      return { from: startOfMonth(today), to: addMonths(startOfMonth(today), 1) };
    case "lastMonth":
      return { from: subMonths(startOfMonth(today), 1), to: startOfMonth(today) };
    case "last30":
      return { from: subDays(today, 29), to: addDays(today, 1) };
    case "last90":
      return { from: subDays(today, 89), to: addDays(today, 1) };
    case "thisYear":
      return { from: startOfYear(today), to: addYears(startOfYear(today), 1) };
    case "lastYear":
      return { from: subYears(startOfYear(today), 1), to: startOfYear(today) };
    case "custom": {
      const from = parseDay(state.customFrom);
      const to = parseDay(state.customTo);
      if (!from || !to) return resolvePeriod({ ...state, preset: "last30" }, now);
      // A ponta final vem como dia inclusivo da UI e vira exclusiva aqui.
      const [start, end] = from <= to ? [from, to] : [to, from];
      return { from: startOfDay(start), to: addDays(startOfDay(end), 1) };
    }
  }
}

/** Intervalo de comparação, ou null quando o usuário desligou a comparação. */
export function resolveCompare(state: PeriodState, period: Range): Range | null {
  switch (state.compare) {
    case "none":
      return null;
    case "previous": {
      const span = period.to.getTime() - period.from.getTime();
      return { from: new Date(period.from.getTime() - span), to: period.from };
    }
    case "lastYear":
      return { from: subYears(period.from, 1), to: subYears(period.to, 1) };
    case "custom": {
      const from = parseDay(state.compareFrom);
      const to = parseDay(state.compareTo);
      if (!from || !to) return null;
      const [start, end] = from <= to ? [from, to] : [to, from];
      return { from: startOfDay(start), to: addDays(startOfDay(end), 1) };
    }
  }
}

/**
 * Rótulo curto do intervalo pro botão e pra sublinha dos cards. A ponta final é
 * mostrada como dia inclusivo (o que a pessoa escolheu), não como o exclusivo interno.
 */
export function formatRangeLabel(range: Range): string {
  const start = range.from;
  const end = subDays(range.to, 1);
  if (isSameDay(start, end)) return format(start, "d 'de' MMM 'de' yyyy", { locale: ptBR });
  if (isSameMonth(start, end) && isSameYear(start, end)) {
    return `${format(start, "d")} a ${format(end, "d 'de' MMM 'de' yyyy", { locale: ptBR })}`;
  }
  if (isSameYear(start, end)) {
    return `${format(start, "d 'de' MMM", { locale: ptBR })} a ${format(end, "d 'de' MMM 'de' yyyy", { locale: ptBR })}`;
  }
  return `${format(start, "d MMM yyyy", { locale: ptBR })} a ${format(end, "d MMM yyyy", { locale: ptBR })}`;
}

/** Nome do período escolhido: o rótulo do preset, ou as datas quando é personalizado. */
export function periodLabel(state: PeriodState, range: Range): string {
  if (state.preset === "custom") return formatRangeLabel(range);
  return PERIOD_OPTIONS.find((o) => o.value === state.preset)?.label ?? "Período";
}

/** Nome da comparação, pra sublinha do card ("vs. período anterior"). */
export function compareLabel(state: PeriodState, compare: Range | null): string | null {
  if (!compare) return null;
  if (state.compare === "previous") return "vs. período anterior";
  if (state.compare === "lastYear") return "vs. ano passado";
  return `vs. ${formatRangeLabel(compare)}`;
}

/**
 * Quantos dias o período cobre. Serve pra escolher a granularidade do gráfico e
 * pra rótulo ("30 dias"). Arredonda pra cima: um período parcial ainda é um dia.
 */
export function periodDays(range: Range): number {
  const ms = range.to.getTime() - range.from.getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export type LocationOption = { id: string; name: string; companyName: string };

/**
 * Rótulo do seletor de unidade. Nenhuma selecionada quer dizer "todas" (o
 * consolidado), que é o estado inicial do painel.
 */
export function locationsLabel(selected: string[], options: LocationOption[]): string {
  if (selected.length === 0) return "Todas as unidades";
  if (selected.length === 1) {
    return options.find((o) => o.id === selected[0])?.name ?? "1 unidade";
  }
  return `${selected.length} unidades`;
}

/**
 * Agrupa as unidades por empresa, mantendo a ordem alfabética das duas pontas.
 * O `filter` é a busca digitada; casa com o nome da unidade ou o da empresa.
 */
export function groupLocations(
  options: LocationOption[],
  filter = "",
): { companyName: string; locations: LocationOption[] }[] {
  const needle = filter.trim().toLowerCase();
  const matched = needle
    ? options.filter(
        (o) =>
          o.name.toLowerCase().includes(needle) || o.companyName.toLowerCase().includes(needle),
      )
    : options;
  const map = new Map<string, LocationOption[]>();
  for (const o of matched) {
    const list = map.get(o.companyName) ?? [];
    list.push(o);
    map.set(o.companyName, list);
  }
  return Array.from(map.entries())
    .map(([companyName, locations]) => ({
      companyName,
      locations: [...locations].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    }))
    .sort((a, b) => a.companyName.localeCompare(b.companyName, "pt-BR"));
}

/** Liga/desliga uma unidade na seleção, sem mutar o array de entrada. */
export function toggleLocation(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}

/**
 * Descarta da seleção salva as unidades que não existem mais. Sem isso, um id de
 * unidade apagada continuaria no sessionStorage filtrando tudo pra zero, sem que a
 * lista mostrasse nada marcado.
 */
export function pruneLocations(selected: string[], options: LocationOption[]): string[] {
  if (selected.length === 0 || options.length === 0) return selected;
  const alive = new Set(options.map((o) => o.id));
  const kept = selected.filter((id) => alive.has(id));
  return kept.length === selected.length ? selected : kept;
}
