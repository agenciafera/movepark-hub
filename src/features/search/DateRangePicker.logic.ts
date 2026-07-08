// Lógica pura do seletor de datas em intervalo (range) — sem React/DOM, testável.
import { format, set } from "date-fns";

/** Horários em passos de 30min: "00:00", "00:30", …, "23:30". */
export const TIME_SLOTS = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
})();

export function setTime(d: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return set(d, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });
}

/** Hora "HH:mm" de uma data; default por papel quando ausente (check-in 08:00, check-out 18:00). */
export function fmtTime(d: Date | null, fallback = "08:00"): string {
  if (!d) return fallback;
  return format(d, "HH:mm");
}

type Range = { from: Date | null; to: Date | null };

/**
 * Funde a seleção do calendário (react-day-picker `DateRange`) com o estado anterior,
 * **preservando os horários** já escolhidos (ou o default por papel). Selecionar só o
 * check-in mantém o check-out vazio (o próximo clique fecha o intervalo).
 */
export function mergeRange(prev: Range, next: { from?: Date; to?: Date } | undefined): Range {
  if (!next?.from) return { from: null, to: null };
  const from = setTime(next.from, fmtTime(prev.from, "08:00"));
  if (!next.to) return { from, to: null };
  return { from, to: setTime(next.to, fmtTime(prev.to, "18:00")) };
}
