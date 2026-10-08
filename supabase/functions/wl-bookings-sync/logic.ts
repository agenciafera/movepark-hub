// Decisões puras da sincronização das reservas do site (reservas-wl-no-hub.md), sem rede nem banco.

/** Orçamento por invocação: a Edge cai em 150s, e cada página leva no máximo o teto de 20s. */
export const START_BUDGET_MS = 90_000;

/** Política vinda de app_setting.wl_booking_import, com os padrões da migration. */
export interface ImportPolicy {
  enabled: boolean;
  pageLimit: number;
  lookbackMonths: number;
}

export function readPolicy(raw: unknown): ImportPolicy {
  const o = (raw ?? {}) as Record<string, unknown>;
  const limit = Number(o.page_limit);
  const lookback = Number(o.lookback_months);
  return {
    enabled: o.enabled === true,
    pageLimit: Number.isFinite(limit) ? Math.min(500, Math.max(1, Math.trunc(limit))) : 200,
    lookbackMonths: Number.isFinite(lookback) && lookback > 0 ? Math.trunc(lookback) : 12,
  };
}

/**
 * Se a página não andou o cursor e diz que tem mais, parar: chamar de novo com o mesmo cursor
 * devolveria a mesma página para sempre.
 */
export function cursorStuck(
  before: { updated_since: string; after_id: number },
  after: { updated_since: string; after_id: number },
  hasMore: boolean,
): boolean {
  return hasMore && before.updated_since === after.updated_since && before.after_id === after.after_id;
}

/**
 * Onde começa a primeira leitura de uma empresa (sem cursor salvo).
 *
 * Começar do início do histórico lia anos de pedidos só para pular os de fora da janela: na
 * primeira passada em produção (08/10/2026) a Aeropark andou dois meses de 2025 em 36 segundos, e a
 * Virapark levaria dias. Começa na janela mais 2 meses de folga, para pegar a reserva comprada
 * antes da janela e usada dentro dela. Hora local de São Paulo, no formato que o legado recebe.
 */
export function initialCursor(now: Date, lookbackMonths: number): { updated_since: string; after_id: number } {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - (lookbackMonths + 2));
  const local = new Date(d.getTime() - 3 * 3600_000); // São Paulo, sem horário de verão desde 2019
  const pad = (n: number) => String(n).padStart(2, "0");
  const s = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ` +
    `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`;
  return { updated_since: s, after_id: 0 };
}
