/**
 * Declaração de tipo do `sitemap-split.logic.mjs`.
 *
 * Existe para o `src/lib/sitemapSplit.test.ts` importar a lógica de build com tipo de
 * verdade: o `tsconfig.app.json` cobre `src`, e sem esta declaração o import de um `.mjs`
 * fora dele quebra o `bun run typecheck`.
 */

export interface ArquivoDeSitemap {
  /** Nome do arquivo no `dist`, ex.: `sitemap-blog.xml`. */
  nome: string;
  /** XML completo do shard, com o mesmo prolog e os mesmos namespaces da origem. */
  conteudo: string;
  /** Quantas URLs o shard carrega. Alimenta a invariante de soma do build. */
  urls: number;
  /** Data mais recente entre as URLs do shard. `undefined` se nenhuma tem `lastmod`. */
  lastmod?: string;
}

export interface ResultadoDoSplit {
  /** Um por seção com pelo menos uma URL, em ordem alfabética. */
  arquivos: ArquivoDeSitemap[];
  /** O `<sitemapindex>` que substitui o `sitemap.xml`. */
  indice: string;
  /** Paths que estavam no sitemap e não no mapa de seções. Caíram em `paginas`. */
  orfas: string[];
}

/**
 * Maior data entre as recebidas, ignorando nulo, vazio e data ilegível.
 * Devolve a string original da vencedora, ou `undefined` se nenhuma servir.
 */
export function maisRecenteDentre(
  ...datas: (string | null | undefined)[]
): string | undefined;

export function dividirSitemap(
  xml: string,
  mapaDeSecoes: Record<string, string[]>,
): ResultadoDoSplit;
