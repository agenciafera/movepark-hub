/**
 * Lógica pura do dashboard do dono (operador). Sem React, sem Supabase: só
 * transforma listas em números, pra ser testável e reaproveitável.
 *
 * As métricas seguem a proposta em docs/testes/furos-visao-dono.md (dinheiro,
 * demanda, saúde). Tudo é derivado de dados que já existem (booking, funil,
 * reviews), sem backend novo.
 */

export type PeriodStat = { revenue: number; count: number; ticket: number };

type RevenueRow = { check_in_at: string; total_amount: number | string | null };

/**
 * Divide as reservas em período atual (>= início) e anterior (< início), e devolve
 * receita, contagem e ticket médio de cada. A janela de origem deve trazer os dois
 * períodos (ex.: 2× o período pra comparar com o anterior).
 */
export function summarizePeriod(
  rows: RevenueRow[],
  periodStartIso: string,
): { current: PeriodStat; previous: PeriodStat } {
  const cur = { revenue: 0, count: 0 };
  const prev = { revenue: 0, count: 0 };
  for (const r of rows) {
    const amount = Number(r.total_amount ?? 0);
    if (r.check_in_at >= periodStartIso) {
      cur.revenue += amount;
      cur.count += 1;
    } else {
      prev.revenue += amount;
      prev.count += 1;
    }
  }
  return {
    current: { ...cur, ticket: cur.count ? cur.revenue / cur.count : 0 },
    previous: { ...prev, ticket: prev.count ? prev.revenue / prev.count : 0 },
  };
}

/** Variação percentual vs período anterior. Null quando não há base de comparação. */
export function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Formata o delta pro `trend` do KpiCard ("+12%" / "-8%"), ou undefined se não há base. */
export function formatDelta(delta: number | null): { value: string; positive: boolean } | undefined {
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
export function averageRating(reviews: { rating: number | null }[]): { avg: number; count: number } {
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
export function averageLeadTimeDays(
  rows: { created_at: string; check_in_at: string }[],
): number {
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
 * Canal de origem: site (fluxo próprio) vs API (reserva criada por chave de API,
 * ex.: o bot). `created_via_api_key_id` preenchido marca a API.
 */
export function channelMix(
  rows: { created_via_api_key_id: string | null }[],
): { site: number; api: number } {
  let site = 0;
  let api = 0;
  for (const r of rows) {
    if (r.created_via_api_key_id) api += 1;
    else site += 1;
  }
  return { site, api };
}
