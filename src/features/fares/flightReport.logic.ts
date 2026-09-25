// Relatório mensal da proteção de voo (25/09/2026): quanto custou à Movepark e quanto o parceiro
// cobrou por fora. Soma as empresas de cada mês; a view já vem agrupada por mês e empresa.

export type FlightMonthRow = {
  month: string | null;
  company_id: string | null;
  claims: number | null;
  delay: number | null;
  cancellation: number | null;
  partner_credit_cents: number | null;
  overage_cents: number | null;
  overage_charged_cents: number | null;
};

export type FlightMonthSummary = {
  month: string;
  claims: number;
  delay: number;
  cancellation: number;
  creditCents: number;
  overageCents: number;
  chargedCents: number;
};

/** Um total por mês, do mais novo para o mais velho. */
export function summarizeFlightMonths(rows: FlightMonthRow[] | undefined): FlightMonthSummary[] {
  const byMonth = new Map<string, FlightMonthSummary>();
  for (const r of rows ?? []) {
    if (!r.month) continue;
    const cur = byMonth.get(r.month) ?? { month: r.month, claims: 0, delay: 0, cancellation: 0, creditCents: 0, overageCents: 0, chargedCents: 0 };
    cur.claims += r.claims ?? 0;
    cur.delay += r.delay ?? 0;
    cur.cancellation += r.cancellation ?? 0;
    cur.creditCents += r.partner_credit_cents ?? 0;
    cur.overageCents += r.overage_cents ?? 0;
    cur.chargedCents += r.overage_charged_cents ?? 0;
    byMonth.set(r.month, cur);
  }
  return [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
}

/** "set/2026" a partir de "2026-09-01". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(m) - 1] ?? m}/${y}`;
}
