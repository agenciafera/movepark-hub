/**
 * Onde fica a faixa de leitura e qual seção ela elege.
 *
 * Separado do hook porque é aqui que mora a regra, e regra precisa de teste sem
 * navegador. O hook só liga isto no `IntersectionObserver`.
 */

/**
 * O `scroll-mt-24` das seções (6rem). É onde a âncora pousa o topo da seção
 * quando o leitor clica no índice, e por isso o número aparece nos dois lugares.
 */
export const SCROLL_MT_PX = 96;

/**
 * A faixa começa abaixo de onde a âncora pousa, nunca em cima.
 *
 * Com a faixa começando nos mesmos 96px, a seção que sai deixava uma fração de
 * pixel dentro dela (medido na /faq: a anterior terminando em 96.09 com a faixa
 * abrindo em 96) e, como a escolha é a primeira em ordem de página, o índice
 * acendia a seção de cima. Dava certo ou errado conforme o arredondamento do
 * scroll, que é o "às vezes não acende" relatado.
 *
 * 12px é folga de sobra para esse arredondamento, que medimos entre 0.09 e
 * 0.21px, e ainda é pequena o bastante para caber o alvo mais baixo que temos: o
 * `h2` do post de blog tem 24px, e com folga maior ele terminaria na borda da
 * faixa em vez de dentro dela.
 */
export const FOLGA_PX = 12;

/** Topo da faixa, contado a partir do topo da janela. */
export const TOPO_FAIXA_PX = SCROLL_MT_PX + FOLGA_PX;

/** Quanto da janela é descartado embaixo. A faixa vai do topo até 40% da tela. */
export const RECORTE_INFERIOR_PCT = 60;

export const ROOT_MARGIN = `-${TOPO_FAIXA_PX}px 0px -${RECORTE_INFERIOR_PCT}% 0px`;

/** Onde a faixa termina, na janela de altura `alturaJanela`. */
export function baseDaFaixa(alturaJanela: number): number {
  return alturaJanela * (1 - RECORTE_INFERIOR_PCT / 100);
}

/** Posição de uma seção na janela, como o observer a enxerga. */
export type Medida = { id: string; topo: number; base: number };

/**
 * Qual seção está sendo lida.
 *
 * A primeira que cruza a faixa, na ordem da página. Quando nenhuma cruza, vale a
 * última que já passou por ela: sem isso, a última seção da página congelava o
 * índice, porque o rodapé ocupa a tela inteira no fim da rolagem e ela termina
 * acima da faixa (medido na /faq: `bottom` em 5px, com a faixa abrindo em 108).
 *
 * Devolve `null` só quando ninguém chegou lá, que é a página no topo. Aí quem
 * decide é o chamador, marcando a primeira.
 */
export function secaoAtiva(medidas: Medida[], topoFaixa: number, baseFaixa: number): string | null {
  const naFaixa = medidas.find((m) => m.base > topoFaixa && m.topo < baseFaixa);
  if (naFaixa) return naFaixa.id;

  let jaPassou: string | null = null;
  for (const m of medidas) {
    if (m.topo <= topoFaixa) jaPassou = m.id;
  }
  return jaPassou;
}
