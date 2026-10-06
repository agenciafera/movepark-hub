/** Declaração de tipo do `resposta-mais-barato.mjs`, para o front importar com tipo. */

/** O mínimo de uma linha de preço pesquisado que a resposta usa (`PesquisadoRow`). */
export interface LinhaPesquisada {
  shortLabel: string;
  path: string | null;
  /** Um total por duração, na mesma ordem de `days`. */
  totals: (number | null)[];
  researchedAt: string;
}

/** O mínimo de uma linha do ranking de parceiro que a resposta usa (`MaisBaratoLinha`). */
export interface LinhaParceiro {
  days: number;
  vencedor: { label: string; parkingTypeName: string; total: number; perDay: number };
}

export interface PesquisadoVencedor {
  total: number;
  perDay: number;
  lotes: { label: string; path: string | null; researchedAt: string }[];
}

export interface RespostaMaisBarato {
  /** A resposta direta: primeira frase da página e `acceptedAnswer` do FAQPage (ADR-002). */
  direta: string;
  /** A resposta da pergunta de 7 dias, quando existe preço de 7 dias. */
  semana: string | null;
  /**
   * O menor preço do mercado na duração mais curta, para a description. `pesquisado` diz se
   * ele é de terceiro, sem reserva pela Movepark (a description não pode prometer reserva).
   */
  menorDoMercado: { total: number; days: number; pesquisado: boolean };
}

export declare function menorPesquisado(
  rows: LinhaPesquisada[],
  days: number[],
  d: number,
): PesquisadoVencedor | null;

export declare function ondePesquisado(v: PesquisadoVencedor, complemento?: string): string;

export declare function respostaMaisBarato(args: {
  prosa: string;
  linhas: LinhaParceiro[];
  pesquisados: LinhaPesquisada[];
  days: number[];
}): RespostaMaisBarato;
