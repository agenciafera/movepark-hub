// Lógica pura do seletor de datas em intervalo (range), sem React/DOM, testável.
import { format, set } from "date-fns";
import { ptBR } from "date-fns/locale";

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
 * Qual ponta o próximo clique preenche. Só existe "checkout" quando há entrada e
 * ainda não há saída; com o intervalo completo, o próximo clique recomeça.
 */
export type PickerPhase = "checkin" | "checkout";

export function pickerPhase(from: Date | null, to: Date | null): PickerPhase {
  return from && !to ? "checkout" : "checkin";
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Dias barrados no calendário. Escolhendo a saída, tudo que vem **antes** da entrada
 * sai de cena: assim o clique inválido não existe, em vez de ser reinterpretado em
 * silêncio (era isso que trocava as pontas sem o usuário pedir).
 *
 * O próprio dia da entrada continua clicável de propósito: entrar 08:00 e sair 18:00
 * no mesmo dia é reserva válida (o banco compara timestamp, `check_out_at >
 * check_in_at`, não data).
 */
export function disabledDays(
  from: Date | null,
  to: Date | null,
  now: Date = new Date(),
): { before: Date } {
  if (pickerPhase(from, to) === "checkout" && from) return { before: startOfDay(from) };
  return { before: startOfDay(now) };
}

/**
 * O próximo intervalo dado o dia clicado. Uma regra só, previsível em qualquer estado:
 * sem entrada (ou com o intervalo já completo) o clique começa de novo; com entrada e
 * sem saída, o clique fecha o intervalo.
 *
 * Substitui o comportamento implícito do react-day-picker, em que clicar na própria
 * data de entrada apagava as duas pontas sem aviso.
 */
export function nextRange(prev: Range, day: Date): Range {
  if (pickerPhase(prev.from, prev.to) === "checkin") return { from: day, to: null };
  // Defesa: o calendário já barra o dia anterior à entrada, mas se chegar aqui
  // (teclado, clique programático), recomeçar é melhor que gravar intervalo invertido.
  if (prev.from && day.getTime() < startOfDay(prev.from).getTime()) return { from: day, to: null };
  return { from: prev.from, to: day };
}

/**
 * Rótulo acessível de um dia. Sem isto o calendário é uma grade de números soltos
 * no leitor de tela: ele lê "25" sem dizer o mês, se está selecionado, nem o que o
 * clique faz. O papel vem dos modificadores que o react-day-picker já calcula.
 */
export function dayAriaLabel(
  day: Date,
  mods: {
    selected?: boolean;
    disabled?: boolean;
    range_start?: boolean;
    range_end?: boolean;
    range_middle?: boolean;
  },
  phase: PickerPhase,
): string {
  const data = format(day, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
  if (mods.disabled) return `${data}. Indisponível.`;
  if (mods.range_start) return `${data}. Entrada selecionada.`;
  if (mods.range_end) return `${data}. Saída selecionada.`;
  if (mods.range_middle) return `${data}. Dentro do período.`;
  if (mods.selected) return `${data}. Selecionado.`;
  return phase === "checkout" ? `${data}. Escolher como saída.` : `${data}. Escolher como entrada.`;
}

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
  next: { from?: Date | null; to?: Date | null } | undefined,
  now: Date = new Date(),
): Range {
  if (!next?.from) return { from: null, to: null };
  const from = snapToFuture(setTime(next.from, fmtTime(prev.from, "08:00")), "08:00", now);
  if (!next.to) return { from, to: null };
  const to = snapToFuture(setTime(next.to, fmtTime(prev.to, "18:00")), "18:00", now);
  return { from, to: ensureAfter(from, to) };
}

/**
 * Garante saída depois da entrada. O caso real é a reserva de um dia só: com entrada
 * às 22:00, a saída herdaria as 18:00 do default e sairia antes de entrar. O banco
 * rejeita (`check_out_at > check_in_at`), então é melhor não deixar montar.
 */
export function ensureAfter(from: Date, to: Date): Date {
  if (to.getTime() > from.getTime()) return to;
  const nextSlot = TIME_SLOTS.find((t) => setTime(from, t).getTime() > from.getTime());
  // Entrada nos últimos 30min do dia: a saída vai pro primeiro slot do dia seguinte.
  if (!nextSlot) return setTime(new Date(from.getTime() + 24 * 60 * 60 * 1000), "00:00");
  return setTime(from, nextSlot);
}
