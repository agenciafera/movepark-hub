import { describe, expect, it } from "vitest";

// Import atravessando a fronteira para `scripts/` de propósito: a lógica é de build e roda
// no `node` do encadeamento do `package.json`, mas sem teste ela seria a única peça do
// pipeline de sitemap sem cobertura. A declaração de tipo mora em
// `scripts/sitemap-split.logic.d.mts`. Ver docs/superpowers/specs/2026-08-17-sitemap-por-secao-design.md.
import {
  VIRADA_URL_ESTACIONAMENTOS,
  dividirSitemap,
  lastmodDeUrlNova,
  lastmodComposto,
  maisRecenteDentre,
} from "../../scripts/sitemap-split.logic.mjs";

const PROLOG = '<?xml version="1.0" encoding="UTF-8"?>';
const ABRE_URLSET =
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">';
const LASTMOD = "2026-08-14T22:43:37.432Z";

function bloco(path: string, lastmod: string = LASTMOD): string {
  return (
    `<url><loc>https://movepark.co${path}</loc><lastmod>${lastmod}</lastmod>` +
    `<changefreq>daily</changefreq><priority>1.0</priority></url>`
  );
}

function sitemapCom(paths: string[]): string {
  // `paths.map(bloco)` passaria o índice como segundo argumento e a primeira URL sairia com
  // `lastmod` 0. O arrow existe para isso.
  return `${PROLOG}${ABRE_URLSET}${paths.map((p) => bloco(p)).join("")}</urlset>`;
}

/** As seis URLs abaixo espelham a forma real: home, institucional, índice e item de seção. */
const PATHS = ["/", "/sobre", "/blog/", "/blog/vaga-em-confins/", "/faq", "/faq/como-cancelar"];

const MAPA = {
  blog: ["/blog/", "/blog/vaga-em-confins/"],
  faq: ["/faq", "/faq/como-cancelar"],
  paginas: ["/", "/sobre"],
};

describe("maisRecenteDentre", () => {
  it("devolve a maior data, na string original", () => {
    expect(maisRecenteDentre("2022-07-22T10:00:00.000Z", "2026-06-15T00:00:00.000Z")).toBe(
      "2026-06-15T00:00:00.000Z",
    );
  });

  it("ignora nulo, vazio e data ilegível", () => {
    expect(maisRecenteDentre(null, undefined, "", "2024-01-02T00:00:00.000Z", "ontem")).toBe(
      "2024-01-02T00:00:00.000Z",
    );
  });

  it("devolve undefined quando não sobra nenhuma data usável", () => {
    expect(maisRecenteDentre(null, undefined, "sei lá")).toBeUndefined();
    expect(maisRecenteDentre()).toBeUndefined();
  });

  it("compara por instante, não por ordem alfabética", () => {
    // "2026-01-05T00:00:00Z" > "2026-01-05T00:00:00.000+02:00" no relógio, mas menor no texto.
    expect(maisRecenteDentre("2026-01-05T00:00:00.000+02:00", "2026-01-05T00:00:00.000Z")).toBe(
      "2026-01-05T00:00:00.000Z",
    );
  });
});

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
      expect(indice).toContain(`<loc>https://movepark.co/${arquivo.nome}</loc>`);
    }
    // O host sai da própria URL do sitemap de origem, não de uma segunda cópia de SITE_URL.
    expect(indice).not.toContain("localhost");
    expect(indice).toContain(`<lastmod>${LASTMOD}</lastmod>`);
  });

  it("dá a cada entrada do índice o lastmod mais recente daquela seção", () => {
    // Com lastmod real por URL, o índice não pode carimbar a data da primeira URL do shard:
    // o Google leria "esta seção mudou em 2026-01-01" quando ela mudou em 2026-06-15.
    const xml =
      `${PROLOG}${ABRE_URLSET}` +
      [
        bloco("/blog/", "2026-01-01T00:00:00.000Z"),
        bloco("/blog/vaga-em-confins/", "2026-06-15T00:00:00.000Z"),
        bloco("/faq", "2025-03-02T00:00:00.000Z"),
        bloco("/faq/como-cancelar", "2025-01-09T00:00:00.000Z"),
      ].join("") +
      `</urlset>`;

    const { indice } = dividirSitemap(xml, {
      blog: ["/blog/", "/blog/vaga-em-confins/"],
      faq: ["/faq", "/faq/como-cancelar"],
    });

    expect(indice).toContain(
      "<loc>https://movepark.co/sitemap-blog.xml</loc><lastmod>2026-06-15T00:00:00.000Z</lastmod>",
    );
    expect(indice).toContain(
      "<loc>https://movepark.co/sitemap-faq.xml</loc><lastmod>2025-03-02T00:00:00.000Z</lastmod>",
    );
  });

  it("omite o lastmod do índice quando a seção não tem nenhum", () => {
    const semData =
      `${PROLOG}${ABRE_URLSET}` +
      `<url><loc>https://movepark.co/sobre</loc></url>` +
      `</urlset>`;

    const { indice } = dividirSitemap(semData, { paginas: ["/sobre"] });

    expect(indice).toContain("<loc>https://movepark.co/sitemap-paginas.xml</loc>");
    expect(indice).not.toContain("<lastmod>");
  });

  it("sobrescreve o daily/1.0 uniforme do plugin com a dica calibrada da seção", () => {
    // O vite-plugin-sitemap carimba daily/1.0 em tudo; dica igual pra todo mundo
    // é dica nenhuma. A seção manda: destino weekly/0.9, home weekly/1.0.
    const xml = `${PROLOG}${ABRE_URLSET}<url><loc>https://movepark.co/destinos/gru</loc><changefreq>daily</changefreq><priority>1.0</priority></url><url><loc>https://movepark.co/</loc><changefreq>daily</changefreq><priority>0.5</priority></url></urlset>`;
    const { arquivos } = dividirSitemap(xml, {
      destinos: ["/destinos/gru"],
      paginas: ["/"],
    });
    const destinos = arquivos.find((a) => a.nome === "sitemap-destinos.xml");
    expect(destinos?.conteudo).toContain("<changefreq>weekly</changefreq>");
    expect(destinos?.conteudo).toContain("<priority>0.9</priority>");
    expect(destinos?.conteudo).not.toContain("daily");
    const paginas = arquivos.find((a) => a.nome === "sitemap-paginas.xml");
    expect(paginas?.conteudo).toContain("<priority>1.0</priority>");
    expect(paginas?.conteudo).toContain("<changefreq>weekly</changefreq>");
  });

  it("recusa entrada que já é um índice, para rodar duas vezes não picotar", () => {
    const indice = `${PROLOG}<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://movepark.co/sitemap-blog.xml</loc></sitemap></sitemapindex>`;

    expect(() => dividirSitemap(indice, MAPA)).toThrow(/índice/i);
  });
});

describe("lastmodDeUrlNova", () => {
  it("registro parado desde antes da virada usa a data da virada", () => {
    // O caso real: em 01/09/2026 os destinos ainda tinham updated_at de 28/05, e o sitemap
    // afirmava ao Google que uma URL de quatro dias nao mudava havia tres meses.
    expect(lastmodDeUrlNova("2026-05-28T18:31:15.592Z")).toBe(VIRADA_URL_ESTACIONAMENTOS);
  });

  it("registro tocado depois da virada manda, porque ai a data e verdadeira", () => {
    expect(lastmodDeUrlNova("2026-08-30T10:00:00.000Z")).toBe("2026-08-30T10:00:00.000Z");
  });

  it("sem data no banco cai na virada, nao em undefined", () => {
    expect(lastmodDeUrlNova(undefined)).toBe(VIRADA_URL_ESTACIONAMENTOS);
    expect(lastmodDeUrlNova(null)).toBe(VIRADA_URL_ESTACIONAMENTOS);
  });

  it("data ilegivel nao derruba o piso", () => {
    expect(lastmodDeUrlNova("nao e data")).toBe(VIRADA_URL_ESTACIONAMENTOS);
  });

  it("aceita outro nascimento, para servir a proxima virada de endereco", () => {
    expect(lastmodDeUrlNova("2026-01-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z")).toBe(
      "2026-06-01T00:00:00.000Z",
    );
  });
});

describe("lastmodComposto: a data da página, não a da linha", () => {
  /**
   * Medido em 24/09/2026: o sitemap declarava 28/08 para as 27 páginas de destino,
   * porque o `lastmod` seguia `destination.updated_at` (máximo 14/08) somado ao piso
   * da virada de URL. A FAQ que renderiza na mesma página estava em 22/09 e os posts
   * em 24/09. `lastmod` é sinal de prioridade de recrastreio, então a data velha
   * despriorizava exatamente o que tinha acabado de mudar; o concorrente declarava
   * 24/09 no mesmo dia.
   */
  it("usa a fonte mais recente que de fato renderiza na página", () => {
    expect(
      lastmodComposto(
        "2026-08-28T00:00:00.000Z", // piso: virada de URL
        "2026-08-14T00:00:00.000Z", // destination.updated_at
        "2026-09-22T00:00:00.000Z", // FAQ do aeroporto
        "2026-09-10T00:00:00.000Z", // lote mapeado
        "2026-09-24T00:00:00.000Z", // post da praça
      ),
    ).toBe("2026-09-24T00:00:00.000Z");
  });

  it("mantém o piso da virada de URL quando tudo é mais antigo", () => {
    // A invariante de `lastmodDeUrlNova` continua: nenhuma URL alega data anterior
    // à própria existência.
    expect(
      lastmodComposto("2026-08-28T00:00:00.000Z", "2026-05-28T00:00:00.000Z", undefined, null),
    ).toBe("2026-08-28T00:00:00.000Z");
  });

  it("ignora fonte ausente sem quebrar", () => {
    expect(
      lastmodComposto("2026-08-28T00:00:00.000Z", undefined, null, "2026-09-01T00:00:00.000Z"),
    ).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("seção de idiomas", () => {
  /**
   * As URLs traduzidas ganharam seção própria (`sitemap-idiomas.xml`) em vez de entrar
   * em `faq`/`destinos`/`blog`. Sem seção declarada elas cairiam em `paginas` e o split
   * as reportaria como órfãs, que é o sintoma de rota nova esquecida, não de decisão.
   */
  const PATHS_I18N = [
    "/",
    "/faq/como-cancelar",
    "/en/faq/how-to-cancel",
    "/es/preguntas-frecuentes/como-cancelar",
    "/en/airport-parking/guarulhos-airport",
  ];
  const MAPA_I18N = {
    faq: ["/faq/como-cancelar"],
    idiomas: [
      "/en/faq/how-to-cancel",
      "/es/preguntas-frecuentes/como-cancelar",
      "/en/airport-parking/guarulhos-airport",
    ],
    paginas: ["/"],
  };

  const porNomeDe = (paths: string[], mapa: Record<string, string[]>) => {
    const { arquivos, orfas } = dividirSitemap(sitemapCom(paths), mapa);
    return { porNome: Object.fromEntries(arquivos.map((a) => [a.nome, a.conteudo])), orfas };
  };

  it("as traduzidas saem em sitemap-idiomas.xml, e nenhuma vira órfã", () => {
    const { porNome, orfas } = porNomeDe(PATHS_I18N, MAPA_I18N);
    expect(orfas).toEqual([]);
    const idiomas = porNome["sitemap-idiomas.xml"];
    expect(idiomas).toBeTruthy();
    for (const p of MAPA_I18N.idiomas) {
      expect(idiomas).toContain(`<loc>https://movepark.co${p}</loc>`);
    }
    // A portuguesa não migra junto: ela continua sendo da seção dela.
    expect(idiomas).not.toContain("/faq/como-cancelar</loc>");
    expect(porNome["sitemap-faq.xml"]).toContain("/faq/como-cancelar</loc>");
  });

  it("recebe as dicas da própria seção, não as de `paginas`", () => {
    const { porNome } = porNomeDe(PATHS_I18N, MAPA_I18N);
    expect(porNome["sitemap-idiomas.xml"]).toContain("<priority>0.7</priority>");
  });
});
