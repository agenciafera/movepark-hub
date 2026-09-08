/**
 * Declaração de tipo do `indexnow.logic.mjs`.
 *
 * Existe para o `src/lib/indexnow.test.ts` importar a lógica do ping com tipo de verdade: o
 * `tsconfig.app.json` cobre `src`, e sem esta declaração o import de um `.mjs` fora dele
 * quebra o `bun run typecheck`.
 */

/** Uma URL do sitemap, com a data da última modificação quando o sitemap declara. */
export interface UrlDoSitemap {
  loc: string;
  lastmod: string | null;
}

/** Corpo da chamada ao IndexNow, no formato que o protocolo define. */
export interface PayloadDoIndexNow {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

/** Se o ping sai neste ambiente, e por quê. O motivo vai para o log do build. */
export interface Decisao {
  sim: boolean;
  motivo: string;
}

export const CHAVE: string;
export const ENDPOINT: string;
export const LIMITE_POR_LOTE: number;

export function chaveValida(chave: unknown): boolean;
export function urlsDoSitemap(xml: string): UrlDoSitemap[];
export function shardsDoIndice(xml: string): string[];
export function urlsParaSubmeter(atual: UrlDoSitemap[], anterior: UrlDoSitemap[]): string[];
export function lotes(urls: string[], tamanho?: number): string[][];
export function montarPayload(entrada: {
  host: string;
  chave: string;
  urls: string[];
}): PayloadDoIndexNow;
export function deveDisparar(
  env?: Record<string, string | undefined>,
  opcoes?: { forcar?: boolean },
): Decisao;
export function apenasDoHost(urls: string[], host: string): string[];
