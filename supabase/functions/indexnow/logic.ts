/**
 * Lógica pura da submissão ao IndexNow, separada do `index.ts` para ter teste de branch sem rede.
 */

/**
 * Host sem esquema e sem barra, que é o formato que o campo `host` do protocolo exige.
 *
 * Mandar `https://movepark.co` no lugar de `movepark.co` devolve 422 ("URLs don't belong to the
 * host"), e o erro não diz qual dos dois campos está errado.
 */
export function hostDe(siteUrl: string): string {
  return siteUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/**
 * Caminhos em URLs absolutas, sem repetição e sem caminho inválido.
 *
 * A deduplicação existe porque a fila só é única entre pedidos pendentes: um pedido já despachado
 * e um novo do mesmo caminho podem cair no mesmo lote quando o anterior é retomado por timeout.
 * URL repetida no `urlList` não quebra a submissão, mas conta contra a cota do host à toa.
 */
export function urlsDosCaminhos(paths: string[], absoluta: (p: string) => string): string[] {
  const vistos = new Set<string>();
  const urls: string[] = [];

  for (const path of paths) {
    if (!path || !path.startsWith("/")) continue;
    const url = absoluta(path);
    if (vistos.has(url)) continue;
    vistos.add(url);
    urls.push(url);
  }

  return urls;
}
