import { describe, expect, it } from "vitest";

// Import atravessando a fronteira para `scripts/` de propósito: a lógica é de build e roda
// no `node` do encadeamento do `package.json`, mas sem teste ela seria a única peça do
// pipeline de sitemap sem cobertura. A declaração de tipo mora em
// `scripts/sitemap-split.logic.d.mts`. Ver docs/superpowers/specs/2026-08-17-sitemap-por-secao-design.md.
import { dividirSitemap } from "../../scripts/sitemap-split.logic.mjs";

const PROLOG = '<?xml version="1.0" encoding="UTF-8"?>';
const ABRE_URLSET =
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">';
const LASTMOD = "2026-08-14T22:43:37.432Z";

function bloco(path: string): string {
  return (
    `<url><loc>https://hub.movepark.co${path}</loc><lastmod>${LASTMOD}</lastmod>` +
    `<changefreq>daily</changefreq><priority>1.0</priority></url>`
  );
}

function sitemapCom(paths: string[]): string {
  return `${PROLOG}${ABRE_URLSET}${paths.map(bloco).join("")}</urlset>`;
}

/** As seis URLs abaixo espelham a forma real: home, institucional, índice e item de seção. */
const PATHS = ["/", "/sobre", "/blog/", "/blog/vaga-em-confins/", "/faq", "/faq/como-cancelar"];

const MAPA = {
  blog: ["/blog/", "/blog/vaga-em-confins/"],
  faq: ["/faq", "/faq/como-cancelar"],
  paginas: ["/", "/sobre"],
};

describe("dividirSitemap", () => {
  it("manda cada URL para o arquivo da seção declarada no mapa", () => {
    const { arquivos } = dividirSitemap(sitemapCom(PATHS), MAPA);

    const porNome = Object.fromEntries(arquivos.map((a) => [a.nome, a.conteudo]));

    expect(Object.keys(porNome).sort()).toEqual([
      "sitemap-blog.xml",
      "sitemap-faq.xml",
      "sitemap-paginas.xml",
    ]);
    expect(porNome["sitemap-blog.xml"]).toContain("/blog/vaga-em-confins/</loc>");
    expect(porNome["sitemap-blog.xml"]).not.toContain("/faq");
    expect(porNome["sitemap-faq.xml"]).toContain("/faq/como-cancelar</loc>");
    expect(porNome["sitemap-paginas.xml"]).toContain("/sobre</loc>");
  });

  it("preserva o prolog e os namespaces do urlset em cada arquivo", () => {
    const { arquivos } = dividirSitemap(sitemapCom(PATHS), MAPA);

    for (const arquivo of arquivos) {
      expect(arquivo.conteudo.startsWith(`${PROLOG}${ABRE_URLSET}`)).toBe(true);
      expect(arquivo.conteudo.endsWith("</urlset>")).toBe(true);
    }
  });

  it("não perde nem duplica URL na fatia", () => {
    const { arquivos } = dividirSitemap(sitemapCom(PATHS), MAPA);

    const total = arquivos.reduce((soma, a) => soma + a.urls, 0);
    expect(total).toBe(PATHS.length);

    const locs = arquivos.flatMap((a) => [...a.conteudo.matchAll(/<loc>([^<]*)<\/loc>/g)]).map(
      (m) => m[1],
    );
    expect(new Set(locs).size).toBe(PATHS.length);
  });

  it("joga URL fora do mapa em paginas e reporta como órfã", () => {
    const comOrfa = sitemapCom([...PATHS, "/pagina-que-ninguem-declarou"]);

    const { arquivos, orfas } = dividirSitemap(comOrfa, MAPA);

    expect(orfas).toEqual(["/pagina-que-ninguem-declarou"]);
    const paginas = arquivos.find((a) => a.nome === "sitemap-paginas.xml");
    expect(paginas?.conteudo).toContain("/pagina-que-ninguem-declarou</loc>");
    expect(paginas?.urls).toBe(3);
  });

  it("monta o índice com os arquivos escritos, e seção vazia não vira arquivo", () => {
    const { arquivos, indice } = dividirSitemap(sitemapCom(PATHS), { ...MAPA, precos: [] });

    expect(arquivos.some((a) => a.nome === "sitemap-precos.xml")).toBe(false);
    expect(indice).not.toContain("sitemap-precos.xml");

    expect(indice.startsWith(PROLOG)).toBe(true);
    expect(indice).toContain("<sitemapindex");
    for (const arquivo of arquivos) {
      expect(indice).toContain(`<loc>https://hub.movepark.co/${arquivo.nome}</loc>`);
    }
    // O host sai da própria URL do sitemap de origem, não de uma segunda cópia de SITE_URL.
    expect(indice).not.toContain("localhost");
    expect(indice).toContain(`<lastmod>${LASTMOD}</lastmod>`);
  });

  it("recusa entrada que já é um índice, para rodar duas vezes não picotar", () => {
    const indice = `${PROLOG}<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://hub.movepark.co/sitemap-blog.xml</loc></sitemap></sitemapindex>`;

    expect(() => dividirSitemap(indice, MAPA)).toThrow(/índice/i);
  });
});
