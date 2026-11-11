/**
 * Lógica pura dos blocos novos do painel do parceiro (Dashboard Operador v2):
 * a leitura do período, a conversão, o melhor dia e a meta de receita.
 *
 * Tudo aqui é derivado do que já existe no banco. A "leitura" em especial é um
 * texto, e texto sobre número mente fácil: por isso ela é montada de um conjunto
 * fechado de frases, cada uma com a condição que a torna verdadeira, e volta
 * `null` quando nenhuma se sustenta. Nunca invente a leitura no componente.
 */

export type DailyRevenue = { date: string; total: number };

export type FunnelRow = { status: string; count: number };

const PAID = ["confirmed", "checked_in", "completed"];

/** Melhor dia de receita do período. Null quando não houve receita. */
export function bestRevenueDay(daily: DailyRevenue[]): DailyRevenue | null {
  let best: DailyRevenue | null = null;
  for (const d of daily) {
    if (d.total > 0 && (!best || d.total > best.total)) best = d;
  }
  return best;
}

/**
 * Em quantos dias do fim do período entrou `share` da receita (0.9 = 90%).
 * Serve pra dizer "a receita entrou toda na última semana" com número na mão.
 * Zero quando não há receita.
 */
export function concentrationWindow(daily: DailyRevenue[], share = 0.9): number {
  const total = daily.reduce((acc, d) => acc + d.total, 0);
  if (total <= 0) return 0;
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  let acc = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    acc += sorted[i].total;
    if (acc >= total * share) return sorted.length - i;
  }
  return sorted.length;
}

export type Conversion = {
  paid: number;
  created: number;
  /** Percentual inteiro de reservas criadas que viraram reserva paga. */
  rate: number;
  expired: number;
  cancelled: number;
  noShow: number;
};

/**
 * Conversão do período: quantas das reservas criadas chegaram a pagar.
 * `expired` é o abandono (carrinho que nunca pagou), separado de `cancelled`.
 */
export function conversion(funnel: FunnelRow[]): Conversion {
  const by = (s: string) => funnel.find((f) => f.status === s)?.count ?? 0;
  const created = funnel.reduce((acc, f) => acc + f.count, 0);
  const paid = PAID.reduce((acc, s) => acc + by(s), 0);
  return {
    paid,
    created,
    rate: created > 0 ? Math.round((paid / created) * 100) : 0,
    expired: by("expired"),
    cancelled: by("cancelled"),
    noShow: by("no_show"),
  };
}

export type SituationRow = { status: string; count: number; pct: number };

/**
 * Situações do período, da maior pra menor, com o percentual sobre o criado.
 * Situação zerada não entra: linha com zero só ocupa espaço. O rótulo fica com
 * quem renderiza (`BOOKING_STATUS_LABELS`), pra não existir uma segunda tabela
 * de nomes de status que envelhece sozinha.
 */
export function situations(funnel: FunnelRow[]): SituationRow[] {
  const created = funnel.reduce((acc, f) => acc + f.count, 0);
  return funnel
    .filter((f) => f.count > 0)
    .map((f) => ({
      status: f.status,
      count: f.count,
      pct: created > 0 ? Math.round((f.count / created) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export type Goal = {
  /** Meta em reais. Null quando a empresa não definiu. */
  target: number | null;
  /** Percentual do realizado sobre a meta, limitado a 100 pra barra não estourar. */
  pct: number;
  /** Largura da barra, já em `%`. */
  width: string;
  reached: boolean;
};

/** Progresso da receita contra a meta. Sem meta, devolve tudo zerado e `target` null. */
export function goalProgress(revenue: number, goalCents: number | null | undefined): Goal {
  const target = goalCents && goalCents > 0 ? goalCents / 100 : null;
  if (!target) return { target: null, pct: 0, width: "0%", reached: false };
  const raw = (revenue / target) * 100;
  const pct = Math.max(0, Math.min(100, Math.round(raw)));
  return { target, pct, width: `${pct}%`, reached: revenue >= target };
}

export type Insight = { title: string; detail: string };

export type InsightInput = {
  revenue: number;
  daily: DailyRevenue[];
  conversion: Conversion;
  /** Tamanho do período em dias, pra saber se a concentração é notável. */
  periodDays: number;
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * A leitura do período: a frase mais acionável que os números sustentam, em
 * ordem de prioridade. Volta `null` quando não há nada honesto a dizer, e aí o
 * card não aparece. É melhor não ter leitura do que ter uma leitura genérica.
 */
export function periodInsight(input: InsightInput): Insight | null {
  const { revenue, daily, conversion: conv, periodDays } = input;

  if (conv.created === 0) return null;

  // 1. Nada pago: o problema é esse, não a distribuição da receita.
  if (conv.paid === 0) {
    return {
      title: `Nenhuma reserva pagou no período`,
      detail: `${conv.created} ${plural(conv.created, "reserva criada", "reservas criadas")} e nenhuma chegou ao pagamento.`,
    };
  }

  // 2. Receita empilhada no fim do período: muda o que olhar amanhã.
  const window = concentrationWindow(daily);
  if (revenue > 0 && window > 0 && periodDays >= 7 && window <= Math.ceil(periodDays / 3)) {
    return {
      title: `Quase toda a receita entrou nos últimos ${window} ${plural(window, "dia", "dias")}`,
      detail: `De ${periodDays} dias no período, ${window} ${plural(window, "concentra", "concentram")} 90% do que entrou.`,
    };
  }

  // 3. Conversão baixa com volume pra sustentar a leitura.
  if (conv.created >= 5 && conv.rate < 50) {
    const perdidas = conv.expired;
    return {
      title: `${conv.rate}% das reservas criadas chegaram a pagar`,
      detail: perdidas
        ? `${conv.paid} ${plural(conv.paid, "paga", "pagas")} em ${conv.created}. ${perdidas} ${plural(perdidas, "expirou", "expiraram")} sem pagamento.`
        : `${conv.paid} ${plural(conv.paid, "paga", "pagas")} em ${conv.created} criadas no período.`,
    };
  }

  // 4. Fallback: o retrato do período, sem adjetivo.
  return {
    title: `${conv.paid} ${plural(conv.paid, "reserva paga", "reservas pagas")} no período`,
    detail: `De ${conv.created} ${plural(conv.created, "reserva criada", "reservas criadas")}, ${conv.paid} ${plural(conv.paid, "chegou", "chegaram")} ao pagamento.`,
  };
}

/**
 * Saudação pela hora local. O painel abre com o nome de quem entrou, e "bom dia"
 * às 19h é o tipo de detalhe que faz o produto parecer desatento.
 */
export function greeting(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Status que entram na agenda (11/11/2026). A agenda é o que vai acontecer no pátio: só reserva
 * que virou venda e não foi cancelada. Pendente e expirada nunca viraram venda (o parceiro nem as
 * vê na lista, ver `partnerSeesBooking`) e cancelada não vai chegar; mostrar qualquer uma delas
 * fazia o balcão esperar carro que não vem. No-show fica: é a chegada que não aconteceu, e o
 * balcão precisa vê-la no dia.
 */
export const AGENDA_STATUSES = ["confirmed", "checked_in", "completed", "no_show"] as const;

export type AgendaKind = "arrival" | "departure";

export type AgendaItem<T> = {
  key: string;
  kind: AgendaKind;
  at: Date;
  booking: T;
};

/** `yyyy-MM-dd` no fuso de quem está olhando (e não o UTC do `toISOString`). */
export function localIsoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Os eventos do dia: cada reserva vira uma chegada (check-in no dia) e/ou uma saída (check-out no
 * dia), cada uma no SEU horário. Antes a saída aparecia no horário da chegada, com o rótulo
 * "Chegada", e a data era comparada em UTC: chegada às 22h caía no dia seguinte.
 * Ordem: pelo horário; no mesmo minuto, chegada antes de saída.
 */
export function agendaItems<T extends { id: string; check_in_at: string; check_out_at: string }>(
  bookings: T[],
  dateIso: string,
): AgendaItem<T>[] {
  const out: AgendaItem<T>[] = [];
  for (const b of bookings) {
    const ci = new Date(b.check_in_at);
    const co = new Date(b.check_out_at);
    if (localIsoDate(ci) === dateIso)
      out.push({ key: `${b.id}:in`, kind: "arrival", at: ci, booking: b });
    if (localIsoDate(co) === dateIso)
      out.push({ key: `${b.id}:out`, kind: "departure", at: co, booking: b });
  }
  return out.sort(
    (a, b) =>
      a.at.getTime() - b.at.getTime() || (a.kind === b.kind ? 0 : a.kind === "arrival" ? -1 : 1),
  );
}

/** Agrupa por hora cheia, só as horas que têm evento (hora vazia era o scroll comprido). */
export function groupAgendaByHour<T>(
  items: AgendaItem<T>[],
): { hour: number; items: AgendaItem<T>[] }[] {
  const groups: { hour: number; items: AgendaItem<T>[] }[] = [];
  for (const it of items) {
    const h = it.at.getHours();
    const last = groups[groups.length - 1];
    if (last && last.hour === h) last.items.push(it);
    else groups.push({ hour: h, items: [it] });
  }
  return groups;
}

/**
 * Para onde a agenda rola ao abrir: hoje, a primeira hora que ainda não passou (o que vem a
 * seguir); outro dia, o topo. `null` quando é para ficar no topo.
 */
export function agendaFocusHour(
  hours: number[],
  dateIso: string,
  now: Date = new Date(),
): number | null {
  if (dateIso !== localIsoDate(now)) return null;
  const next = hours.find((h) => h >= now.getHours());
  return next ?? null;
}

/**
 * Dias da tira da agenda: o dia escolhido no meio, três de cada lado.
 * Devolve datas locais em `yyyy-MM-dd`.
 */
export function agendaStrip(selectedIso: string): string[] {
  const [y, m, d] = selectedIso.split("-").map(Number);
  const base = new Date(y, (m ?? 1) - 1, d ?? 1);
  if (Number.isNaN(base.getTime())) return [];
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(base);
    day.setDate(base.getDate() + i - 3);
    const mm = String(day.getMonth() + 1).padStart(2, "0");
    const dd = String(day.getDate()).padStart(2, "0");
    return `${day.getFullYear()}-${mm}-${dd}`;
  });
}
