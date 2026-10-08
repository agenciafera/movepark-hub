// Decisões puras da sincronização das reservas do site (reservas-wl-no-hub.md), sem rede nem banco.

/** Orçamento por invocação: a Edge cai em 150s, e cada página leva no máximo o teto de 20s. */
export const START_BUDGET_MS = 90_000;

/** Política vinda de app_setting.wl_booking_import, com os padrões da migration. */
export interface ImportPolicy {
  enabled: boolean;
  pageLimit: number;
}

export function readPolicy(raw: unknown): ImportPolicy {
  const o = (raw ?? {}) as Record<string, unknown>;
  const limit = Number(o.page_limit);
  return {
    enabled: o.enabled === true,
    pageLimit: Number.isFinite(limit) ? Math.min(500, Math.max(1, Math.trunc(limit))) : 200,
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
