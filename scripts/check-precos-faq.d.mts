/**
 * Tipos das funções puras do guarda de preço, para o teste importar sem `@ts-expect-error`.
 *
 * Só o que é exportado e testável entra aqui; `main()` não é exportado de propósito.
 */

export declare const TTL_DIAS: number;
export declare const AVISO_DIAS: number;

/** Um pátio mapeado, como o guarda precisa dele. */
export type Pesquisado = {
  /** Os valores de diária, semana, quinzena e mês que existirem, sem os nulos. */
  valores: number[];
  /** Sem data não há preço: valor sem `researched_at` é afirmação sem lastro. */
  temData: boolean;
  researchedAt?: string | null;
};

export type Achado = {
  tipo: "divergência" | "sem lastro";
  nome: string;
  detalhe: string;
};

export declare function nomeCurto(publicName: string | null | undefined): string;
export declare function paraNumero(texto: string): number | null;
export declare function tokensDistintivos(
  nomesCurtos: string[],
  palavrasDaPraca?: string[],
): Map<string, string[]>;
export declare function linhasComPreco(md: string | null | undefined): string[][];
export declare function divergencias(
  md: string | null | undefined,
  pesquisado: Map<string, Pesquisado>,
  palavrasDaPraca?: string[],
): Achado[];
export declare function diasDesde(iso: string, hoje: Date): number;
