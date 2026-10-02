// Lógica pura da página de destino (testável sem render).

/**
 * O "a partir de" do topo da página de destino: a menor diária AVULSA (1 dia) entre as
 * unidades do destino.
 *
 * Era a menor diária de qualquer duração, e em Confins isso dava R$ 13,33, que é a diária de
 * quem fica 30 dias na BePark. O mesmo destino dizia R$ 45,00 na meta, no `/precos`, no
 * llms.txt e nas FAQs, e fonte que se contradiz é fonte que a IA descarta (Conteúdo 40,
 * docs/specs/ataque-cnf-bepark.md §2.3). Agora o número solto é a diária avulsa, lida do mesmo
 * resumo que monta a meta (`destinationSummary`), e a diária longa só aparece com a duração
 * escrita ao lado, como nos cards e na tabela.
 *
 * Sem preço de 1 diária (todo parceiro do destino exige estadia mínima) devolve null: "diária a
 * partir de" com o preço de uma semana seria afirmar o que ninguém vende.
 */
export function diariaAvulsa(
  summary: { byDuration: { days: number; from: number }[] } | null | undefined,
): number | null {
  const avulsa = summary?.byDuration.find((d) => d.days === 1)?.from ?? null;
  return avulsa != null && avulsa > 0 ? avulsa : null;
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
