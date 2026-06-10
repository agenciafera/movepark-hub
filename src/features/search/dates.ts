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
