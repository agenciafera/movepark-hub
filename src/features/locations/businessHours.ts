/**
 * Horário de funcionamento da unidade (86ajp6vnf). Modelo por dia da semana,
 * consultado só quando a unidade não é 24h. A forma casa com o jsonb
 * `location.business_hours` (chaves mon..sun, valor {open,close} em HH:MM ou null
 * quando o dia fecha).
 */

export const WEEKDAYS = [
  { key: "mon", label: "Segunda" },
  { key: "tue", label: "Terça" },
  { key: "wed", label: "Quarta" },
  { key: "thu", label: "Quinta" },
  { key: "fri", label: "Sexta" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
] as const;

export type Weekday = (typeof WEEKDAYS)[number]["key"];
/** Um dia: par aberto/fechado em HH:MM, ou null quando a unidade não abre. */
export type DayHours = { open: string; close: string } | null;
export type BusinessHours = Record<Weekday, DayHours>;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

/** Todos os dias fechados. Ponto de partida quando o parceiro desliga o 24h. */
export function emptyBusinessHours(): BusinessHours {
  return WEEKDAYS.reduce((acc, d) => {
    acc[d.key] = null;
    return acc;
  }, {} as BusinessHours);
}

/**
 * Normaliza um jsonb qualquer (vindo do banco) para BusinessHours em ordem estável
 * de dias. Só aceita um dia com open/close válidos em HH:MM; qualquer coisa fora do
 * gabarito vira null (dia fechado). Ordem estável importa: o form compara sujo por
 * JSON.stringify.
 */
export function parseBusinessHours(json: unknown): BusinessHours {
  const out = emptyBusinessHours();
  if (!json || typeof json !== "object") return out;
  const record = json as Record<string, unknown>;
  for (const d of WEEKDAYS) {
    const raw = record[d.key];
    if (raw && typeof raw === "object") {
      const { open, close } = raw as { open?: unknown; close?: unknown };
      if (typeof open === "string" && typeof close === "string" && isValidTime(open) && isValidTime(close)) {
        out[d.key] = { open, close };
      }
    }
  }
  return out;
}

/** Tem pelo menos um dia com horário definido (para não salvar um objeto todo vazio). */
export function hasAnyHours(hours: BusinessHours): boolean {
  return WEEKDAYS.some((d) => hours[d.key] !== null);
}
