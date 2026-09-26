// Lógica pura do repasse automático (E0.3.13), sem rede, para caber em teste.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Data de hoje em Brasília (YYYY-MM-DD): o dia do repasse é o dia do parceiro, não o UTC. */
export function brtToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export type AutoOutcome = "withdraw" | "below_min" | "no_balance";

export function decideOutcome(a: { availableCents: number; minCents: number; gatewayAvailableCents: number | null }): AutoOutcome {
  if (a.availableCents < a.minCents) return "below_min";
  if ((a.gatewayAvailableCents ?? 0) < a.availableCents) return "no_balance";
  return "withdraw";
}

export interface RunInput { dryRun: boolean; companyId: string | null; today: string | null }

export function parseRunInput(body: unknown, isHubAdmin: boolean): RunInput {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  return {
    dryRun: b.dry_run === true,
    companyId: typeof b.company_id === "string" && UUID_RE.test(b.company_id) ? b.company_id : null,
    today: isHubAdmin && typeof b.today === "string" && DATE_RE.test(b.today) ? b.today : null,
  };
}
