// Resolução das datas de busca. Quando o usuário chega em /search sem datas
// (ex: link de destino /search?dest=GRU ou categoria), usamos um período padrão
// (estimativa) para já listar as vagas com preço, em vez de bloquear a tela.
// Lógica pura → testável (Vitest).

export type ResolvedDates = { from: string; to: string; isEstimate: boolean };

/** Período padrão: amanhã às 10h por 1 diária. */
export function defaultSearchRange(now: Date): { from: string; to: string } {
  const from = new Date(now);
  from.setDate(from.getDate() + 1);
  from.setHours(10, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Usa as datas da URL; se qualquer uma faltar, cai no período padrão (estimativa). */
export function resolveSearchDates(from: string, to: string, now: Date): ResolvedDates {
  if (from && to) return { from, to, isEstimate: false };
  const d = defaultSearchRange(now);
  return { from: d.from, to: d.to, isEstimate: true };
}

/**
 * Estica a janela de um link até a estadia mínima do lote.
 *
 * Na vitrine o card mostra o preço da menor estadia que a unidade vende ("3 diárias"), mas
 * o link levava a janela da vitrine (2 diárias). O cliente clicava num preço de 3 diárias e
 * caía numa página que dizia "essa vaga exige reserva mínima de 3 diárias", sem preço. Aqui
 * o `to` acompanha o que o card prometeu.
 *
 * Devolve os params intactos quando não há mínimo, quando a janela já cobre, ou quando as
 * datas não dão para ler.
 */
export function stretchParamsToMinStay(
  params: URLSearchParams,
  minStayDays: number | null | undefined,
): URLSearchParams {
  if (!minStayDays || minStayDays < 1) return params;
  const from = params.get("from");
  const to = params.get("to");
  if (!from || !to) return params;

  const start = new Date(from);
  const end = new Date(to);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return params;

  const dayMs = 24 * 60 * 60 * 1000;
  const currentDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / dayMs));
  if (currentDays >= minStayDays) return params;

  const stretched = new Date(start.getTime() + minStayDays * dayMs);
  const next = new URLSearchParams(params);
  next.set("to", stretched.toISOString());
  return next;
}
