// Lógica pura do partner-daily-digest (testável sem rede).

/** O dia do resumo: a data de hoje em Brasília, no formato YYYY-MM-DD. */
export function digestDay(nowMs: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(nowMs));
}

/** Corpo opcional: `day` (YYYY-MM-DD), `company_id` e `dry_run` servem para rodar à mão. */
export function parseDigestBody(body: unknown): { day: string | null; companyId: string | null; dryRun: boolean } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const day = typeof b.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.day) ? b.day : null;
  const companyId = typeof b.company_id === "string" && b.company_id.trim() ? b.company_id.trim() : null;
  return { day, companyId, dryRun: b.dry_run === true };
}

/** Quem recebe: a equipe com bookings:read; sem ninguém, o contato da empresa. Sem repetição. */
export function pickRecipients(members: string[] | null | undefined, fallback: string | null | undefined): string[] {
  const lista = (members ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (lista.length === 0 && fallback && fallback.trim()) lista.push(fallback.trim().toLowerCase());
  return [...new Set(lista)];
}

export interface DigestRow {
  company_id: string;
  company_name: string;
  entradas: unknown[] | null;
  saidas: unknown[] | null;
  novas: unknown[] | null;
}

/** Contagens do dia; zero nas três quer dizer "não manda". */
export function digestCounts(r: DigestRow): { entradas: number; saidas: number; novas: number; total: number } {
  const entradas = r.entradas?.length ?? 0;
  const saidas = r.saidas?.length ?? 0;
  const novas = r.novas?.length ?? 0;
  return { entradas, saidas, novas, total: entradas + saidas + novas };
}
