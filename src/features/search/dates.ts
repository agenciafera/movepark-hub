// Resolução das datas de busca. Quando o usuário chega em /search sem datas
// (ex: link de destino /search?dest=GRU ou categoria), usamos um período padrão
// (estimativa) para já listar as vagas com preço, em vez de bloquear a tela.
// Lógica pura → testável (Vitest).

export type ResolvedDates = { from: string; to: string; isEstimate: boolean };

/**
 * Período padrão da busca: amanhã às 22h, saindo às 8h cinco dias depois.
 *
 * É a MESMA janela que a barra de busca propõe, e tem que continuar sendo: até 11/09/2026 havia
 * duas contas para a mesma pergunta, e a barra dizia amanhã 22h por 5 diárias enquanto a lista
 * buscava amanhã 10h por 1 diária. Em `/search` sem datas o cliente lia um período no topo e
 * recebia o resultado de outro, e clicar na lupa sem mexer em nada saltava de 8 para 18 vagas.
 *
 * O salto não era defeito do filtro: as 10 vagas que somem exigem 2 ou 3 diárias e realmente não
 * vendem uma noite. O defeito era propor justamente a janela em que metade do catálogo não vende.
 * A janela de viagem (sair à noite, voltar de manhã, cinco dias depois) é a que descreve quem
 * procura estacionamento de aeroporto.
 */
export function defaultSearchDates(now: Date): { from: Date; to: Date } {
  const from = new Date(now);
  from.setHours(from.getHours() + 24, 0, 0, 0);
  from.setHours(22);
  const to = new Date(from);
  to.setDate(to.getDate() + 5);
  to.setHours(8);
  return { from, to };
}

/** A mesma janela de `defaultSearchDates`, em ISO, que é como a query e a URL falam. */
export function defaultSearchRange(now: Date): { from: string; to: string } {
  const { from, to } = defaultSearchDates(now);
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
