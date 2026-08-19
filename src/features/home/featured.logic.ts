/**
 * Regras puras da curadoria da vitrine, fora de qualquer componente ou rede.
 *
 * Ficam aqui porque são o que pode dar errado de verdade nesta tela: mover o primeiro card para
 * cima, mover o último para baixo, ou salvar uma ordem com posições repetidas. Nada disso precisa
 * de banco para ser testado.
 */

export type Ordenavel = { id: string; sort_order: number };

/** Uma linha que muda de posição. É o que a mutation grava. */
export type NovaPosicao = { id: string; sort_order: number };

/**
 * Troca um destaque de lugar com o vizinho.
 *
 * Devolve só as duas linhas que mudaram, e um array vazio quando não há para onde ir (primeiro
 * subindo, último descendo). Vazio é resposta legítima, não erro: o botão fica desabilitado nas
 * pontas e ninguém precisa tratar exceção por clicar onde não dá.
 *
 * A troca é de `sort_order` entre os dois, e não uma renumeração da lista toda, porque a lista
 * pode ter posição repetida vinda de qualquer lugar (import, edição manual no banco). Renumerar
 * mexeria em linha que ninguém pediu para mexer.
 */
export function trocarPosicao<T extends Ordenavel>(
  lista: T[],
  id: string,
  direcao: "cima" | "baixo",
): NovaPosicao[] {
  const ordenada = ordenar(lista);
  const i = ordenada.findIndex((r) => r.id === id);
  if (i < 0) return [];

  const j = direcao === "cima" ? i - 1 : i + 1;
  if (j < 0 || j >= ordenada.length) return [];

  const atual = ordenada[i];
  const vizinho = ordenada[j];

  // Empate de sort_order deixaria a troca sem efeito: os dois já valem o mesmo, e gravar o mesmo
  // número de volta não move nada na tela. Nesse caso desempata dando ao de cima o número menor.
  if (atual.sort_order === vizinho.sort_order) {
    const [primeiro, segundo] = direcao === "cima" ? [atual, vizinho] : [vizinho, atual];
    return [
      { id: primeiro.id, sort_order: primeiro.sort_order },
      { id: segundo.id, sort_order: segundo.sort_order + 1 },
    ];
  }

  return [
    { id: atual.id, sort_order: vizinho.sort_order },
    { id: vizinho.id, sort_order: atual.sort_order },
  ];
}

/** Ordem de exibição: `sort_order` e, no empate, o id, para a lista não dançar entre renders. */
export function ordenar<T extends Ordenavel>(lista: T[]): T[] {
  return [...lista].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

/** Próxima posição livre no fim da lista. */
export function proximaPosicao(lista: { sort_order: number }[]): number {
  return lista.reduce((maior, r) => Math.max(maior, r.sort_order), 0) + 1;
}

/**
 * Rótulo do destino num card ou numa linha da curadoria.
 *
 * É só o `short_name`, sem prefixo de código, porque o `short_name` JÁ carrega o código onde ele
 * faz sentido: "Viracopos (VCP)", "Guarulhos (GRU)". Prefixar de novo produzia
 * "(VCP) Viracopos (VCP)" em todos os cards da home, e "(tiete) Tietê" nos destinos que não são
 * aeroporto, onde o `code` é um slug que nunca deveria aparecer na tela.
 */
export function rotuloDeDestino(
  d: { code: string; name: string; short_name: string | null } | null,
): string | null {
  if (!d) return null;
  return d.short_name ?? d.name;
}
