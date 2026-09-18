// Lógica pura da página de destino (testável sem render).

/** Menor preço por diária entre os resultados de busca; null se vazio. */
export function lowestPerDay(results: { price: { per_day: number } }[]): number | null {
  if (!results.length) return null;
  return Math.min(...results.map((r) => r.price.per_day));
}

/**
 * Menor diária do destino inteiro, lida da matriz de preço do motor.
 *
 * O "A partir de" do topo mostrava o total de 1 diária, que é a duração mais curta e por isso a
 * mais CARA da tabela: a página prometia "a partir de R$ 40,00" logo acima de cards que agora
 * dizem R$ 24,90. Aqui a conta percorre todas as durações da matriz, que é a mesma fonte da
 * tabela de preços mais abaixo.
 */
export function lowestMatrixDaily(
  units: { prices: { days: number; total: number | null }[] | null }[],
): number | null {
  const diarias = units.flatMap((u) =>
    (u.prices ?? [])
      .filter((p) => p.total != null && p.total > 0 && p.days > 0)
      .map((p) => Math.round((p.total! / p.days) * 100) / 100),
  );
  return diarias.length > 0 ? Math.min(...diarias) : null;
}

/**
 * Destinos relacionados p/ cross-link: exclui o atual, prioriza os populares e
 * depois `sort_order`, limitando a `limit`.
 */
export function pickRelatedDestinations<
  T extends { id: string; is_popular?: boolean | null; sort_order?: number | null },
>(all: T[], currentId: string, limit = 6): T[] {
  return all
    .filter((d) => d.id !== currentId)
    .sort((a, b) => {
      const pop = Number(Boolean(b.is_popular)) - Number(Boolean(a.is_popular));
      if (pop !== 0) return pop;
      return (a.sort_order ?? 999) - (b.sort_order ?? 999);
    })
    .slice(0, limit);
}

/**
 * Os pontos do destino numa linha só, sem repetir o que se repete.
 *
 * O banco guarda "Terminal 1", "Terminal 2", "Terminal 3", e a ficha de abertura tem
 * 320px: escrito por extenso, o valor ocupava três linhas e empurrava o resto. Quando
 * todos os nomes começam pela mesma palavra, ela sai uma vez só ("Terminal 1, 2 e 3").
 * Nomes sem prefixo comum saem inteiros, porque cortar ali inventaria um apelido.
 */
export function pointsSummary(names: string[]): string {
  const limpos = names.map((n) => n.trim()).filter(Boolean);
  if (limpos.length === 0) return "";
  if (limpos.length === 1) return limpos[0];

  const prefixo = limpos[0].split(" ")[0];
  const todosComPrefixo =
    prefixo.length > 1 &&
    limpos.every((n) => n.startsWith(`${prefixo} `) && n.length > prefixo.length + 1);
  const partes = todosComPrefixo ? limpos.map((n) => n.slice(prefixo.length + 1)) : limpos;
  const lista = `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
  return todosComPrefixo ? `${prefixo} ${lista}` : lista;
}
