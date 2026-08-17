/**
 * Lógica pura do split do sitemap: recebe o XML e o mapa de seções, devolve os arquivos e o
 * índice. Não toca em disco, para o teste (`src/lib/sitemapSplit.test.ts`) rodar sem fixture
 * de sistema de arquivos. O I/O mora em `scripts/split-sitemap.mjs`.
 *
 * Desenho em docs/superpowers/specs/2026-08-17-sitemap-por-secao-design.md.
 */

/** Nome do arquivo de uma seção. É o contrato de URL: `/sitemap-blog.xml`. */
function nomeDoArquivo(secao) {
  return `sitemap-${secao}.xml`;
}

/**
 * Chave de comparação entre a URL do sitemap e o path do mapa.
 *
 * A barra final é significativa no blog (`/blog/<slug>/` é a canônica herdada do WordPress)
 * e ausente no resto, então os dois lados são normalizados antes de comparar. A raiz é o
 * único caso em que a barra fica.
 */
function chave(path) {
  const semBarra = path.replace(/\/+$/, "");
  return semBarra === "" ? "/" : semBarra;
}

/**
 * @param {string} xml conteúdo do `dist/sitemap.xml` já corrigido pelo canonicalize
 * @param {Record<string, string[]>} mapaDeSecoes seção → paths, emitido pelo vite.config.ts
 */
export function dividirSitemap(xml, mapaDeSecoes) {
  // Guarda de idempotência: rodar o split duas vezes sobre o mesmo arquivo picotaria o
  // índice em vez de refazê-lo.
  if (xml.includes("<sitemapindex")) {
    throw new Error(
      "sitemap.xml já é um índice. O split não roda duas vezes sobre o mesmo arquivo; " +
        "refaça o build.",
    );
  }

  const blocos = [...xml.matchAll(/<url>[\s\S]*?<\/url>/g)].map((m) => m[0]);
  if (blocos.length === 0) {
    throw new Error("sitemap.xml sem nenhuma URL. Sinal de build quebrado, não de site vazio.");
  }

  // Prolog + `<urlset ...>` reaproveitados palavra por palavra: os namespaces dos shards
  // ficam idênticos aos do arquivo de origem, sem XML remontado à mão.
  const abertura = xml.slice(0, xml.indexOf("<url>"));

  const secaoPorPath = new Map();
  for (const [secao, paths] of Object.entries(mapaDeSecoes)) {
    for (const path of paths) secaoPorPath.set(chave(path), secao);
  }

  const porSecao = new Map(Object.keys(mapaDeSecoes).map((secao) => [secao, []]));
  // `paginas` é o destino das órfãs, então precisa existir mesmo se o mapa não a declarar.
  if (!porSecao.has("paginas")) porSecao.set("paginas", []);

  const orfas = [];
  let origem = "";

  for (const bloco of blocos) {
    const loc = bloco.match(/<loc>([^<]*)<\/loc>/)?.[1] ?? "";
    const url = new URL(loc);
    // O host sai da própria URL do sitemap, e não de uma segunda cópia de SITE_URL: um
    // ponto a menos para lembrar na migração para o movepark.co.
    if (!origem) origem = url.origin;

    const secao = secaoPorPath.get(chave(url.pathname));
    if (secao) {
      porSecao.get(secao).push(bloco);
      continue;
    }
    // URL que o plugin descobriu sozinho varrendo o dist atrás de HTML. Vai para `paginas`
    // e é reportada; quem cobra decisão explícita é o src/lib/sitemapRoutes.test.ts.
    orfas.push(url.pathname);
    porSecao.get("paginas").push(bloco);
  }

  const arquivos = [...porSecao.entries()]
    .filter(([, blocosDaSecao]) => blocosDaSecao.length > 0)
    // Ordem alfabética para o índice sair igual a cada build, independente da ordem das
    // chaves do JSON: arquivo que muda sozinho polui o diff e esconde mudança de verdade.
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([secao, blocosDaSecao]) => ({
      nome: nomeDoArquivo(secao),
      conteudo: `${abertura}${blocosDaSecao.join("")}</urlset>`,
      urls: blocosDaSecao.length,
    }));

  const prolog = xml.match(/^<\?xml[^>]*\?>/)?.[0] ?? "";
  // O plugin carimba o mesmo timestamp de build em toda URL, então a primeira serve de
  // lastmod do índice sem inventar relógio dentro de uma função pura.
  const lastmod = xml.match(/<lastmod>([^<]*)<\/lastmod>/)?.[1];
  const entradas = arquivos
    .map(
      ({ nome }) =>
        `<sitemap><loc>${origem}/${nome}</loc>` +
        (lastmod ? `<lastmod>${lastmod}</lastmod>` : "") +
        `</sitemap>`,
    )
    .join("");

  const indice =
    `${prolog}<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    `${entradas}</sitemapindex>`;

  return { arquivos, indice, orfas };
}
