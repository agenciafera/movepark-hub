/**
 * Lógica pura da visão da rede (Dashboard Manager v2): concentração de receita,
 * ranking de unidades, faixa dominante de permanência e a leitura do período.
 *
 * A leitura segue a mesma regra do painel do parceiro: um conjunto fechado de
 * frases, cada uma com a condição que a torna verdadeira, e `null` quando nenhuma
 * se sustenta. Nunca escreva a leitura no componente.
 */

export type RankedLocation = {
  id: string;
  name: string;
  company_name: string;
  bookings: number;
  revenue: number;
  vehicle_days: number;
};

export type Network = { locations_total: number; locations_with_revenue: number };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Percentual inteiro da parte sobre o total. Zero quando não há total. */
export function share(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export type Concentration = {
  /** Participação da unidade líder na receita, em percentual inteiro. */
  topShare: number;
  leader: RankedLocation | null;
  /** Quantas unidades somam 80% da receita. Zero quando não há receita. */
  headCount: number;
  withRevenue: number;
};

/**
 * Quão dependente a rede está de poucas unidades. `headCount` é o menor número
 * de unidades que soma 80% da receita: é o número que responde "se uma cair,
 * quanto do mês vai junto".
 */
export function concentration(rows: RankedLocation[], totalRevenue: number): Concentration {
  const earners = rows.filter((r) => r.revenue > 0).sort((a, b) => b.revenue - a.revenue);
  if (earners.length === 0 || totalRevenue <= 0) {
    return { topShare: 0, leader: null, headCount: 0, withRevenue: 0 };
  }
  let acc = 0;
  let headCount = 0;
  for (const r of earners) {
    acc += r.revenue;
    headCount += 1;
    if (acc >= totalRevenue * 0.8) break;
  }
  return {
    topShare: share(earners[0].revenue, totalRevenue),
    leader: earners[0],
    headCount,
    withRevenue: earners.length,
  };
}

export type RankRow = RankedLocation & {
  position: number;
  /** Largura da barra sobre a líder, já em `%`. */
  width: string;
  share: number;
};

/**
 * Ranking pronto pra render: posição, participação e a largura da barra medida
 * contra a LÍDER (não contra o total), que é o que dá leitura de distância entre
 * a primeira e as outras. Unidade sem receita entra com barra zerada, de propósito.
 */
export function rankLocations(rows: RankedLocation[], totalRevenue: number): RankRow[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.revenue - a.revenue || b.bookings - a.bookings || a.name.localeCompare(b.name, "pt-BR"),
  );
  const top = sorted[0]?.revenue ?? 0;
  return sorted.map((r, i) => ({
    ...r,
    position: i + 1,
    share: share(r.revenue, totalRevenue),
    width: top > 0 && r.revenue > 0 ? `${Math.max(2, Math.round((r.revenue / top) * 100))}%` : "0%",
  }));
}

/** Detalhe da linha do ranking: empresa e o volume, ou o aviso de rede parada. */
export function rankDetail(row: RankedLocation): string {
  if (row.bookings === 0) return `${row.company_name} · sem reservas no período`;
  return `${row.company_name} · ${row.bookings} ${plural(row.bookings, "reserva", "reservas")} · ${row.vehicle_days} ${plural(row.vehicle_days, "diária", "diárias")}`;
}

export const STAY_LABEL: Record<number, string> = {
  1: "1 diária",
  2: "2 a 3",
  3: "4 a 6",
  4: "7 a 14",
  5: "15 a 29",
  6: "30 ou mais",
};

export type StayBar = {
  sort: number;
  label: string;
  bookings: number;
  width: string;
  top: boolean;
};

/**
 * Barras de permanência: as seis faixas sempre, com a largura medida contra a
 * faixa mais cheia. Faixa vazia continua na lista, porque o buraco na
 * distribuição é informação (ninguém fica mais de uma semana, por exemplo).
 */
export function stayBars(rows: { sort: number; bookings: number }[]): StayBar[] {
  const max = rows.reduce((m, r) => Math.max(m, r.bookings), 0);
  return [1, 2, 3, 4, 5, 6].map((sort) => {
    const found = rows.find((r) => r.sort === sort);
    const bookings = found?.bookings ?? 0;
    return {
      sort,
      label: STAY_LABEL[sort],
      bookings,
      width: max > 0 && bookings > 0 ? `${Math.max(2, Math.round((bookings / max) * 100))}%` : "0%",
      top: bookings > 0 && bookings === max,
    };
  });
}

/** Faixa de permanência com mais reservas. Null quando não há reserva. */
export function dominantStay(rows: { sort: number; bookings: number }[]): StayBar | null {
  const bars = stayBars(rows);
  const top = bars.find((b) => b.top);
  return top ?? null;
}

/** Quanto das reservas fica até 3 diárias. Serve pra leitura da tabela curta. */
export function shortStayShare(rows: { sort: number; bookings: number }[]): number {
  const total = rows.reduce((acc, r) => acc + r.bookings, 0);
  const short = rows.filter((r) => r.sort <= 2).reduce((acc, r) => acc + r.bookings, 0);
  return share(short, total);
}

export type Insight = { title: string; detail: string };

export type NetworkInsightInput = {
  revenue: number;
  network: Network;
  concentration: Concentration;
  customers: { new: number; returning: number };
};

/**
 * A leitura da rede, em ordem de prioridade. Volta `null` quando não há nada
 * honesto a dizer, e o card mostra o aviso de "sem leitura" em vez de uma frase
 * genérica.
 */
export function networkInsight(input: NetworkInsightInput): Insight | null {
  const { revenue, network, concentration: conc, customers } = input;
  const { locations_total: total, locations_with_revenue: earning } = network;

  if (total === 0) return null;

  // 1. Rede parada: nada mais importa se ninguém vendeu.
  if (revenue <= 0 || earning === 0) {
    return {
      title: "Nenhuma unidade gerou receita no período",
      detail: `As ${total} ${plural(total, "unidade ativa está parada", "unidades ativas estão paradas")} no recorte escolhido.`,
    };
  }

  // 2. Receita presa numa unidade: o risco que o Manager precisa enxergar.
  if (conc.leader && conc.topShare >= 40) {
    const reais = Math.round(conc.topShare / 10);
    return {
      title: `${conc.leader.name} sozinha faz ${reais} de cada 10 reais da rede`,
      detail: `${earning} de ${total} ${plural(total, "unidade gerou", "unidades geraram")} receita. Uma queda ali derruba o período inteiro.`,
    };
  }

  // 3. Rede larga, mas com muita unidade parada.
  const idle = total - earning;
  if (idle > 0 && earning / total < 0.5) {
    return {
      title: `${idle} de ${total} ${plural(idle, "unidade ficou", "unidades ficaram")} sem nenhuma reserva paga`,
      detail: `A receita do período veio de ${earning} ${plural(earning, "unidade", "unidades")}.`,
    };
  }

  // 4. Crescimento por recompra: leitura de aquisição.
  // A frase evita o "não é X, é Y" de propósito (regra de escrita do projeto):
  // o contraste fica nos dois números da sublinha, que dizem o mesmo sem o tique.
  const clientes = customers.new + customers.returning;
  if (clientes >= 10 && customers.returning / clientes >= 0.7) {
    return {
      title: `A rede está crescendo por recompra`,
      detail: `${share(customers.returning, clientes)}% das reservas vieram de quem já tinha reservado, contra ${customers.new} ${plural(customers.new, "cliente novo", "clientes novos")} no período.`,
    };
  }

  // 5. Fallback: o retrato, sem adjetivo.
  return {
    title: `${earning} de ${total} ${plural(earning, "unidade gerou", "unidades geraram")} receita`,
    detail: conc.headCount
      ? `${conc.headCount} ${plural(conc.headCount, "unidade responde", "unidades respondem")} por 80% do que entrou.`
      : `A receita ficou distribuída pela rede.`,
  };
}
