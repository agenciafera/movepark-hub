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

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * true quando o horário `hhmm` no dia `day` já passou em relação a `now`. Espelho do piso
 * server-authoritative (`check_in_in_past` no banco): a entrada não pode ser retroativa.
 */
export function isTimeSlotPast(day: Date, hhmm: string, now: Date = new Date()): boolean {
  return setTime(day, hhmm).getTime() < now.getTime();
}

/**
 * Se `day` é hoje e o horário `desired` já passou, devolve o próximo slot de 30min ainda futuro;
 * senão devolve `desired`. Dias futuros e passados não sofrem ajuste (o dia passado é barrado pelo
 * calendário; a autoridade final é o `create_booking_atomic`).
 */
export function nextFutureTime(day: Date, desired: string, now: Date = new Date()): string {
  if (!isSameDay(day, now)) return desired;
  if (!isTimeSlotPast(day, desired, now)) return desired;
  return TIME_SLOTS.find((t) => !isTimeSlotPast(day, t, now)) ?? desired;
}

/** Move o horário de `d` pro próximo slot futuro quando `d` cai hoje e já passou. */
function snapToFuture(d: Date, fallback: string, now: Date): Date {
  return setTime(d, nextFutureTime(d, fmtTime(d, fallback), now));
}

/**
 * Funde a seleção do calendário (react-day-picker `DateRange`) com o estado anterior,
 * **preservando os horários** já escolhidos (ou o default por papel). Selecionar só o
 * check-in mantém o check-out vazio (o próximo clique fecha o intervalo). Quando a data cai
 * hoje e o horário preservado já passou, avança pro próximo slot futuro (não oferece passado).
 */
export function mergeRange(
  prev: Range,
  next: { from?: Date; to?: Date } | undefined,
  now: Date = new Date(),
): Range {
  if (!next?.from) return { from: null, to: null };
  const from = snapToFuture(setTime(next.from, fmtTime(prev.from, "08:00")), "08:00", now);
  if (!next.to) return { from, to: null };
  return { from, to: snapToFuture(setTime(next.to, fmtTime(prev.to, "18:00")), "18:00", now) };
}
