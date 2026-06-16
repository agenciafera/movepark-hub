// Lógica pura da página de destino (testável sem render).

/** Menor preço por diária entre os resultados de busca; null se vazio. */
export function lowestPerDay(results: { price: { per_day: number } }[]): number | null {
  if (!results.length) return null;
  return Math.min(...results.map((r) => r.price.per_day));
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
