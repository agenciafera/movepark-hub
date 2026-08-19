import { carUnits, priceFor, type PriceDestination } from "@/features/price-index/priceIndex.logic";

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
 * Menor diária avulsa de um destino, para o card de cross-link.
 *
 * Sai da MESMA matriz que a tabela de preço da página (`priceFor(u, 1)`), e nunca de
 * uma segunda consulta: dois caminhos para o mesmo número viram dois números na
 * mesma sessão. Vaga de moto fica fora, pelo `carUnits`, porque moto compara com
 * moto e um "a partir de R$ 9,90" de moto num card de carro é engano.
 */
export function destinationFromPrice(dest: PriceDestination): number | null {
  const totais = carUnits(dest.units)
    .map((u) => priceFor(u, 1)?.total ?? null)
    .filter((t): t is number => t != null && t > 0);
  return totais.length > 0 ? Math.min(...totais) : null;
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
