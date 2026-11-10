// Lógica pura do team-daily-digest (testável sem rede).

/** O dia do resumo: ontem em Brasília, no formato YYYY-MM-DD. */
export function teamDigestDay(nowMs: number): string {
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(nowMs));
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Corpo opcional: `day` (YYYY-MM-DD) e `dry_run` (monta sem mandar e devolve o HTML). */
export function parseTeamDigestBody(body: unknown): { day: string | null; dryRun: boolean } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const day = typeof b.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.day) ? b.day : null;
  return { day, dryRun: b.dry_run === true };
}

/** Destinatários: e-mails separados por vírgula, ponto-e-vírgula ou espaço, sem repetir. */
export function parseTeamRecipients(raw: string | null | undefined): string[] {
  const lista = String(raw ?? "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"));
  return [...new Set(lista)];
}
