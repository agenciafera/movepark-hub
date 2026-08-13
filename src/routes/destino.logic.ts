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

/**
 * Bloco "Mais bem avaliados": só quem já foi avaliado, por nota desc, cortando em `limit`.
 *
 * A ordenação vive aqui, e não só na Edge, porque a página passou a ter duas fontes para a
 * mesma lista: a busca com datas (que já vem ordenada por nota) e a semente do build (que
 * vem ordenada por preço). Aplicar a mesma regra nos dois casos evita o bloco sair em ordem
 * de preço no HTML pré-renderizado e trocar de ordem quando a busca responde.
 */
export function pickTopRated<
  T extends { location: { review_count: number | null; review_avg: number | null } },
>(items: T[], limit = 4): T[] {
  return items
    .filter((i) => (i.location.review_count ?? 0) > 0)
    .sort((a, b) => (b.location.review_avg ?? 0) - (a.location.review_avg ?? 0))
    .slice(0, limit);
}
