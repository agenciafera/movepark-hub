/**
 * Lógica pura do dashboard do dono (operador). Sem React, sem Supabase: só
 * transforma listas em números, pra ser testável e reaproveitável.
 *
 * As métricas seguem a proposta em docs/testes/furos-visao-dono.md (dinheiro,
 * demanda, saúde). Tudo é derivado de dados que já existem (booking, funil,
 * reviews), sem backend novo.
 */

export type PeriodStat = {
  revenue: number;
  count: number;
  ticket: number;
  /** Diárias vendidas (vaga-dia): dia-calendário ocupado, somado nas reservas do período. */
  vehicleDays: number;
};

export type StayRow = {
  check_in_at: string;
  check_out_at: string;
  total_amount: number | string | null;
};

const DAY = 86_400_000;

/**
 * Diárias de uma estadia: dias-calendário ocupados, de `check_in` até o dia do
 * `check_out` menos um instante. É a mesma convenção da capacidade e da RPC do
 * Manager, então uma estadia que entra e sai no mesmo dia vale 1.
 *
 * A conta roda em UTC de propósito: o resto do front já fatia o ISO pra pegar a
 * data (`check_in_at.slice(0, 10)`), e misturar fuso local aqui faria o mesmo
 * booking contar diferente conforme a máquina de quem olha.
 */
export function stayDays(checkInIso: string, checkOutIso: string): number {
  const start = Math.floor(Date.parse(checkInIso) / DAY);
  const end = Math.floor((Date.parse(checkOutIso) - 1) / DAY);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(1, end - start + 1);
}

const empty = (): PeriodStat => ({ revenue: 0, count: 0, ticket: 0, vehicleDays: 0 });

function accumulate(rows: StayRow[]): PeriodStat {
  const out = empty();
  for (const r of rows) {
    out.revenue += Number(r.total_amount ?? 0);
    out.count += 1;
    out.vehicleDays += stayDays(r.check_in_at, r.check_out_at);
  }
  out.ticket = out.count ? out.revenue / out.count : 0;
  return out;
}

/**
 * Resume o período atual e o de comparação. Cada lista já vem do banco recortada
 * na sua janela, então aqui é só somar: receita, reservas, ticket e diárias.
 * Sem comparação escolhida, `previous` volta zerado.
 */
export function summarizeRanges(
  currentRows: StayRow[],
  previousRows: StayRow[] | null,
): { current: PeriodStat; previous: PeriodStat } {
  return {
    current: accumulate(currentRows),
    previous: previousRows ? accumulate(previousRows) : empty(),
  };
}

/** Variação percentual vs período anterior. Null quando não há base de comparação. */
export function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Formata o delta pro `trend` do KpiCard ("+12%" / "-8%"), ou undefined se não há base. */
export function formatDelta(
  delta: number | null,
): { value: string; positive: boolean } | undefined {
  if (delta === null || !Number.isFinite(delta)) return undefined;
  const rounded = Math.round(delta);
  return { value: `${rounded > 0 ? "+" : ""}${rounded}% vs anterior`, positive: rounded >= 0 };
}

export type FunnelRow = { status: string; count: number };

/** Taxa de cancelamento (canceladas + no-show sobre o total) do funil de status. */
export function cancellationRate(funnel: FunnelRow[]): {
  total: number;
  cancelled: number;
  noShow: number;
  rate: number;
} {
  let total = 0;
  let cancelled = 0;
  let noShow = 0;
  for (const f of funnel) {
    // `expired` (carrinho abandonado, nunca pago) e `pending` (ainda em aberto) ficam FORA da
    // taxa: o denominador é só reserva que chegou a um desfecho pago. Sem isso, o abandono
    // inflava a taxa (ex.: 84% que eram quase todos abandono).
    if (f.status === "expired" || f.status === "pending") continue;
    total += f.count;
    if (f.status === "cancelled") cancelled += f.count;
    if (f.status === "no_show") noShow += f.count;
  }
  return { total, cancelled, noShow, rate: total ? ((cancelled + noShow) / total) * 100 : 0 };
}

/**
 * Referência de mercado pra taxa de cancelamento em reserva pré-paga: os bons
 * seguram até 20%; entre 20% e 40% acende alerta; acima disso é alto. (Ver as
 * fontes de pesquisa em docs/testes/furos-visao-dono.md.)
 */
export function cancellationBenchmark(rate: number): {
  label: string;
  tone: "good" | "warn" | "bad";
} {
  if (rate <= 20) return { label: "dentro do saudável (até 20%)", tone: "good" };
  if (rate <= 40) return { label: "acima do saudável (20% a 40%)", tone: "warn" };
  return { label: "alto (acima de 40%)", tone: "bad" };
}

/** Nota média e quantas avaliações têm nota, a partir da lista de reviews. */
export function averageRating(reviews: { rating: number | null }[]): {
  avg: number;
  count: number;
} {
  const rated = reviews.filter((r) => typeof r.rating === "number");
  const sum = rated.reduce((acc, r) => acc + (r.rating ?? 0), 0);
  return { avg: rated.length ? sum / rated.length : 0, count: rated.length };
}

/** Avaliações ainda sem resposta do estabelecimento (`owner_response`). */
export function pendingReviews(reviews: { owner_response: string | null }[]): number {
  return reviews.filter((r) => !r.owner_response).length;
}

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Antecedência média (lead time): dias entre a criação da reserva e o check-in.
 * Diferença negativa (dado torto) é tratada como 0. Zero se não houver reserva.
 */
export function averageLeadTimeDays(rows: { created_at: string; check_in_at: string }[]): number {
  if (rows.length === 0) return 0;
  const total = rows.reduce((acc, r) => {
    const diff = (new Date(r.check_in_at).getTime() - new Date(r.created_at).getTime()) / DAY_MS;
    return acc + Math.max(0, diff);
  }, 0);
  return total / rows.length;
}

/**
 * Contagem por tarifa (basica/flex/superflex). Ignora reserva sem tarifa.
 *
 * NÃO usar no dashboard do dono: o mix de tarifa revela quanto a Movepark ganha por
 * reserva, então é visão de Super Admin. Fica aqui, testada, para a visão do manager.
 */
export function fareMix(rows: { fare_tier: string | null }[]): Record<string, number> {
  const mix: Record<string, number> = {};
  for (const r of rows) {
    if (!r.fare_tier) continue;
    mix[r.fare_tier] = (mix[r.fare_tier] ?? 0) + 1;
  }
  return mix;
}

/**
 * Mix de tarifa com a RECEITA da tarifa (o que a Movepark ganha por tipo). Visão de Super
 * Admin. `fare_price_cents` vem em centavos; a receita sai em reais.
 */
export function fareRevenueMix(
  rows: { fare_tier: string | null; fare_price_cents: number | null }[],
): Record<string, { count: number; revenue: number }> {
  const mix: Record<string, { count: number; revenue: number }> = {};
  for (const r of rows) {
    if (!r.fare_tier) continue;
    const entry = mix[r.fare_tier] ?? { count: 0, revenue: 0 };
    entry.count += 1;
    entry.revenue += Number(r.fare_price_cents ?? 0) / 100;
    mix[r.fare_tier] = entry;
  }
  return mix;
}

/**
 * Canal de origem: site (fluxo próprio) vs API (reserva criada por chave de API,
 * ex.: o bot). `created_via_api_key_id` preenchido marca a API.
 */
export function channelMix(rows: { created_via_api_key_id: string | null }[]): {
  site: number;
  api: number;
} {
  let site = 0;
  let api = 0;
  for (const r of rows) {
    if (r.created_via_api_key_id) api += 1;
    else site += 1;
  }
  return { site, api };
}

/** Soma capacidade e ocupação (booked) das linhas de ocupação, ignorando datas bloqueadas. */
export function aggregateOccupancy(
  rows: { capacity: number | null; booked_count: number | null; blocked: boolean | null }[],
): { capacityDays: number; bookedDays: number } {
  let capacityDays = 0;
  let bookedDays = 0;
  for (const r of rows) {
    if (r.blocked) continue;
    capacityDays += Number(r.capacity ?? 0);
    bookedDays += Number(r.booked_count ?? 0);
  }
  return { capacityDays, bookedDays };
}

/** Taxa de ocupação (%) = vagas ocupadas sobre a capacidade disponível no período. */
export function occupancyRate(bookedDays: number, capacityDays: number): number {
  return capacityDays > 0 ? (bookedDays / capacityDays) * 100 : 0;
}

/**
 * RevPAR (receita por vaga-dia disponível): total no período dividido pela capacidade-dia.
 * É o RevPAR de hotelaria aplicado à vaga. Zero se não há capacidade.
 */
export function revpar(revenue: number, capacityDays: number): number {
  return capacityDays > 0 ? revenue / capacityDays : 0;
}

// ── Dashboard do Manager ────────────────────────────────────────────────────

/**
 * Faixas de permanência do dashboard do Manager. O `sort` casa com o `case` da RPC
 * `manager_dashboard_overview`; mudar um lado exige mudar o outro.
 */
export const STAY_BUCKETS = [
  { sort: 1, label: "1 diária" },
  { sort: 2, label: "2 a 3" },
  { sort: 3, label: "4 a 6" },
  { sort: 4, label: "7 a 14" },
  { sort: 5, label: "15 a 29" },
  { sort: 6, label: "30 ou mais" },
] as const;

export type StayBucketRow = { sort: number; bookings: number; revenue: number };

/**
 * Completa as faixas que a RPC não devolveu (as sem reserva) com zero, na ordem.
 * Sem isso o gráfico pula faixas e engana a leitura da distribuição.
 */
export function fillStayBuckets(
  rows: StayBucketRow[],
): { sort: number; label: string; bookings: number; revenue: number }[] {
  return STAY_BUCKETS.map((b) => {
    const row = rows.find((r) => r.sort === b.sort);
    return {
      sort: b.sort,
      label: b.label,
      bookings: row?.bookings ?? 0,
      revenue: row?.revenue ?? 0,
    };
  });
}

/** Percentual de uma parte sobre o total, arredondado. Zero quando não há total. */
export function sharePct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export type FlowHour = { hour: number; vehicles: number; passengers: number; pcd: number };

/**
 * Totais do dia e a hora de pico do fluxo. `peakHour` é null quando não há
 * movimento; no empate fica a primeira hora (a leitura do dia começa cedo).
 */
export function flowTotals(hours: FlowHour[]): {
  vehicles: number;
  passengers: number;
  pcd: number;
  peakHour: number | null;
  peakVehicles: number;
} {
  let vehicles = 0;
  let passengers = 0;
  let pcd = 0;
  let peakHour: number | null = null;
  let peakVehicles = 0;
  for (const h of hours) {
    vehicles += h.vehicles;
    passengers += h.passengers;
    pcd += h.pcd;
    if (h.vehicles > peakVehicles) {
      peakVehicles = h.vehicles;
      peakHour = h.hour;
    }
  }
  return { vehicles, passengers, pcd, peakHour, peakVehicles };
}

/** Hora cheia no formato do painel ("06h", "18h"). */
export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}h`;
}
