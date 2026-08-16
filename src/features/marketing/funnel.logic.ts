/**
 * Geometria do funil em trapézios empilhados.
 *
 * Cada degrau é um trapézio: a aresta de cima tem a largura do próprio valor, e a de baixo tem a
 * largura do degrau seguinte. É isso que faz as faixas se encaixarem e o desenho afunilar sozinho,
 * em vez de a gente inventar um estreitamento decorativo.
 *
 * A largura segue o volume numa escala de raiz quadrada, não linear. O motivo é que o rótulo mora
 * dentro da faixa: na escala linear, um funil real (236 → 53 → 31 → 24) joga os três últimos
 * degraus entre 10% e 22% de largura, onde nenhum texto cabe. Com um piso simples eles saíam todos
 * na largura mínima e o funil parava de afunilar, que é pior: o desenho passava a esconder a queda.
 *
 * A raiz mantém a ORDEM e a proporção relativa visível, comprimindo a cauda. É a mesma lógica de
 * quem codifica quantidade em área. Em troca, o número exato e o percentual aparecem escritos em
 * toda faixa, então a leitura precisa nunca depende de medir a largura no olho, e a legenda diz
 * que a largura é indicativa.
 *
 * A aresta de baixo do ÚLTIMO degrau não representa valor nenhum (não existe degrau seguinte),
 * então ela afunila num bico só para fechar o desenho.
 */

export type FunnelStep = { key: string; label: string; count: number };

export type FunnelBand = {
  key: string;
  label: string;
  count: number;
  /** Largura da aresta de cima, em % do container. */
  topPct: number;
  /** Largura da aresta de baixo, em % do container. */
  bottomPct: number;
  /** Fatia do topo do funil, para o rótulo "% do total". */
  shareOfTop: number;
  /** Conversão sobre o degrau ANTERIOR, que é onde a desistência aparece. */
  conversion: number;
  /** Quantos não chegaram neste degrau, vindos do anterior. */
  dropped: number;
  /** Índice 0..3 do passo na rampa de cor. */
  tone: number;
};

/** Piso de largura, em %, para o rótulo caber mesmo num degrau que zerou. */
export const LARGURA_MINIMA = 24;

/** O bico do último trapézio, como fração da própria aresta de cima. */
const BICO = 0.62;

export function larguraDe(count: number, topo: number): number {
  if (topo <= 0) return 0;
  const fatia = Math.min(1, Math.max(0, count / topo));
  return Math.max(LARGURA_MINIMA, Math.round(Math.sqrt(fatia) * 1000) / 10);
}

/**
 * Converte os degraus do funil em faixas desenháveis.
 *
 * Devolve vazio quando o topo é zero: sem ninguém entrando, não há funil, e desenhar quatro faixas
 * de largura mínima sugeriria movimento que não houve.
 */
export function funnelBands(steps: FunnelStep[]): FunnelBand[] {
  const topo = steps[0]?.count ?? 0;
  if (topo <= 0) return [];

  return steps.map((step, i) => {
    const anterior = i > 0 ? steps[i - 1].count : step.count;
    const proximo = steps[i + 1]?.count;
    const topPct = larguraDe(step.count, topo);

    return {
      key: step.key,
      label: step.label,
      count: step.count,
      topPct,
      bottomPct:
        proximo === undefined
          ? Math.round(topPct * BICO * 10) / 10
          : larguraDe(proximo, topo),
      shareOfTop: Math.round((step.count / topo) * 100),
      conversion: i === 0 ? 100 : anterior > 0 ? Math.round((step.count / anterior) * 100) : 0,
      dropped: i === 0 ? 0 : Math.max(0, anterior - step.count),
      tone: Math.min(i, 3),
    };
  });
}

/**
 * O `clip-path` do trapézio. As arestas são centradas, então o funil afunila para o meio, e não
 * para um dos lados.
 */
export function bandClipPath(band: FunnelBand): string {
  // Arredonda em duas casas: 22,5% de 236 rende 61.22881355932203% no clip-path, e um atributo
  // de estilo com 14 decimais não muda um pixel na tela, só suja o DOM e o diff.
  const arredonda = (n: number) => Math.round(n * 100) / 100;
  const t = band.topPct / 2;
  const b = band.bottomPct / 2;
  return `polygon(${arredonda(50 - t)}% 0%, ${arredonda(50 + t)}% 0%, ${arredonda(50 + b)}% 100%, ${arredonda(50 - b)}% 100%)`;
}
