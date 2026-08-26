/**
 * Declaração de tipo do `gsc-baseline.logic.mjs`.
 *
 * Existe para o `src/lib/gscBaseline.test.ts` importar a lógica do coletor com tipo de verdade:
 * o `tsconfig.app.json` cobre `src`, e sem esta declaração o import de um `.mjs` fora dele
 * quebra o `bun run typecheck`.
 */

/** Aeroporto da onda 1 do plano de conteúdo. */
export interface Aeroporto {
  /** Código IATA, que é como o recorte identifica a coluna. */
  code: string;
  /** Nome de exibição no relatório, ex.: `Guarulhos (GRU)`. */
  nome: string;
  /** Slug do destino no site, usado para casar a URL. */
  slug: string;
  /** Termos que denunciam o aeroporto na consulta ou na URL, já sem acento. */
  termos: string[];
}

/** Cluster de cabeça da busca, na ordem de prioridade de atribuição. */
export interface Cluster {
  id: "proximidade" | "barato" | "preco";
  nome: string;
  termos: string[];
}

/** Linha crua da Search Analytics, como a API devolve. */
export interface LinhaDaApi {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** Linha de consulta já anotada com aeroporto e cluster. */
export interface ConsultaClassificada {
  consulta: string;
  aeroporto: string;
  cluster: string;
  /** Todos os clusters em que a consulta bateu, para a sobreposição ficar auditável. */
  clusters: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** Uma célula do cruzamento aeroporto x cluster. */
export interface CelulaDoRecorte {
  aeroporto: string;
  cluster: string;
  consultas: number;
  cliques: number;
  impressoes: number;
  /** Média ponderada por impressão. `null` quando a célula não teve nenhuma impressão. */
  posicao: number | null;
  topConsultas: ConsultaClassificada[];
}

/** Coluna de um CSV: título do cabeçalho e como extrair o valor da linha. */
export interface ColunaDeCsv<T> {
  titulo: string;
  valor: (linha: T) => string | number | null | undefined;
}

export const AEROPORTOS: Aeroporto[];
export const CLUSTERS: Cluster[];

export function normalizar(texto: unknown): string;
export function aeroportoDaConsulta(consulta: string): string | null;
export function aeroportoDaUrl(url: string): string | null;
export function clustersDaConsulta(consulta: string): { principal: string | null; todos: string[] };
export function janelaDe16Meses(hoje: Date, diasDeAtraso?: number): { inicio: string; fim: string };
export function posicaoPonderada(
  linhas: { impressions?: number; position?: number }[],
): number | null;
export function recorteDeClusters(linhasDeConsulta: Partial<LinhaDaApi>[]): CelulaDoRecorte[];
export function classificarConsultas(
  linhasDeConsulta: Partial<LinhaDaApi>[],
): ConsultaClassificada[];
export function paraCsv<T>(colunas: ColunaDeCsv<T>[], linhas: T[]): string;
export function numero(valor: number | null | undefined, casas?: number): string;
export function emPtBr(valor: number | null | undefined, casas?: number): string;
export function escaparPipe(texto: unknown): string;
