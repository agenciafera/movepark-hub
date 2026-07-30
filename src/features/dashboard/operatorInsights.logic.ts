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
 * Faixa de horas a mostrar na agenda: da primeira à última hora com evento, com
 * uma folga de uma hora de cada lado. Sem evento, mostra o comercial (8h às 20h).
 */
export function agendaHours(hours: number[]): number[] {
  const valid = hours.filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
  if (valid.length === 0) return Array.from({ length: 13 }, (_, i) => i + 8);
  const from = Math.max(0, Math.min(...valid) - 1);
  const to = Math.min(23, Math.max(...valid) + 1);
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
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
