import { describe, expect, it } from "vitest";

import {
  diagnostica,
  fatosDaPagina,
  locsDoSitemap,
  relatorioMarkdown,
  temNoindex,
} from "./auditoria-site.logic.mjs";

const BASE = "https://movepark.co";

function html({
  titulo = "Título",
  descricao = "Descrição",
  canonical,
  robots,
  h1 = 1,
  links = [],
} = {}) {
  return [
    "<html><head>",
    `<title>${titulo}</title>`,
    `<meta data-rh="true" name="description" content="${descricao}">`,
    robots ? `<meta name="robots" content="${robots}">` : "",
    canonical ? `<link data-rh="true" rel="canonical" href="${canonical}">` : "",
    "</head><body>",
    "<h1>x</h1>".repeat(h1),
    ...links.map((l) => `<a class="x" href="${l}">l</a>`),
    "</body></html>",
  ].join("");
}

/** Página 200 do sitemap, já com os fatos extraídos do HTML. */
const pagina = (url, opcoes = {}) => [
  url,
  { status: 200, fatos: fatosDaPagina(html({ canonical: url, ...opcoes }), url) },
];

const tipos = (problemas) => problemas.map((p) => `${p.severidade}:${p.tipo}`);

describe("locsDoSitemap", () => {
  it("lê índice e sitemap de URLs, com entidade decodificada", () => {
    const xml = `<urlset><url><loc>https://movepark.co/a?x=1&amp;y=2</loc></url><url><loc> https://movepark.co/b </loc></url></urlset>`;
    expect(locsDoSitemap(xml)).toEqual(["https://movepark.co/a?x=1&y=2", "https://movepark.co/b"]);
  });
});

describe("fatosDaPagina", () => {
  it("extrai meta, canonical, H1 e separa link interno de externo", () => {
    const f = fatosDaPagina(
      html({
        titulo: "Estacionamento &amp; aeroporto",
        canonical: `${BASE}/x`,
        robots: "noindex, follow",
        h1: 2,
        links: [
          "/estacionamentos/aeroporto-guarulhos/aeropark?dest=GRU&amp;vaga=valet",
          `${BASE}/blog/`,
          "#topo",
          "mailto:oi@movepark.co",
          "/apple-touch-icon.png",
          "https://www.viracopos.com/pt_br/#voos",
        ],
      }),
      `${BASE}/x`,
    );
    expect(f.titulo).toBe("Estacionamento & aeroporto");
    expect(f.canonical).toBe(`${BASE}/x`);
    expect(f.robots).toBe("noindex, follow");
    expect(f.h1).toBe(2);
    // Query some: a mesma página com filtro não vira outra URL a checar.
    expect([...f.internos]).toEqual(["/estacionamentos/aeroporto-guarulhos/aeropark", "/blog/"]);
    expect([...f.externos]).toEqual(["https://www.viracopos.com/pt_br/"]);
  });
});

describe("temNoindex", () => {
  it.each([
    ["noindex, follow", true],
    ["none", true],
    ["index, follow", false],
    [null, false],
  ])("%s → %s", (valor, esperado) => expect(temNoindex(valor)).toBe(esperado));
});

describe("diagnostica", () => {
  const vazio = { alvosInternos: new Map(), base: BASE };

  it("página saudável e linkada não gera problema", () => {
    const paginas = new Map([
      pagina(`${BASE}/`, { links: ["/a"] }),
      pagina(`${BASE}/a`, { titulo: "A", descricao: "da" }),
    ]);
    expect(diagnostica({ ...vazio, paginas })).toEqual([]);
  });

  it("URL do sitemap que não responde 200 é erro, com o destino do redirect", () => {
    const paginas = new Map([[`${BASE}/velha`, { status: 301, location: "/nova" }]]);
    const [p] = diagnostica({ ...vazio, paginas });
    expect(p).toMatchObject({ severidade: "erro", tipo: "sitemap-sem-200" });
    expect(p.detalhe).toContain("301 para /nova");
  });

  // Regressão da primeira rodada (06/10/2026): 70 arquivos do blog no sitemap com noindex.
  it("noindex em URL do sitemap é erro, venha da meta ou do cabeçalho", () => {
    const url = `${BASE}/blog/page/2/`;
    const meta = new Map([pagina(url, { robots: "noindex, follow" })]);
    const cabecalho = new Map([[url, { ...pagina(url)[1], xRobots: "noindex, follow" }]]);
    expect(tipos(diagnostica({ ...vazio, paginas: meta }))).toContain("erro:noindex");
    expect(tipos(diagnostica({ ...vazio, paginas: cabecalho }))).toContain("erro:noindex");
  });

  it("canonical para outro caminho ou outro host é erro; contra o preview vale o host canônico", () => {
    const outra = new Map([pagina(`${BASE}/a`, { canonical: `${BASE}/b` })]);
    expect(tipos(diagnostica({ ...vazio, paginas: outra }))).toContain("erro:canonical-diferente");

    const preview = "http://localhost:4173";
    const noPreview = new Map([pagina(`${preview}/a`, { canonical: `${BASE}/a` })]);
    const r = diagnostica({
      alvosInternos: new Map(),
      base: preview,
      hostCanonico: "movepark.co",
      paginas: noPreview,
    });
    expect(tipos(r)).not.toContain("erro:canonical-diferente");
  });

  // Regressão da primeira rodada: os .html de prévia do gerador de imagem viraram páginas no
  // sitemap, sem canonical nem description.
  it("página sem canonical, description ou H1 vira aviso; sem title é erro", () => {
    const url = `${BASE}/images/blog/x/foto-1`;
    const paginas = new Map([
      [url, { status: 200, fatos: fatosDaPagina("<title></title><p>x</p>", url) }],
    ]);
    expect(tipos(diagnostica({ ...vazio, paginas }))).toEqual(
      expect.arrayContaining([
        "aviso:sem-canonical",
        "erro:sem-title",
        "aviso:sem-description",
        "aviso:sem-h1",
      ]),
    );
  });

  it("title repetido entre páginas é um aviso só, com todas as URLs", () => {
    const paginas = new Map([
      pagina(`${BASE}/a`, { titulo: "Igual" }),
      pagina(`${BASE}/b`, { titulo: "Igual" }),
    ]);
    const dup = diagnostica({ ...vazio, paginas }).filter((p) => p.tipo === "title-duplicado");
    expect(dup).toHaveLength(1);
    expect(dup[0].detalhe).toContain(`${BASE}/a, ${BASE}/b`);
  });

  it("página que ninguém linka é órfã; link para si mesma não conta, e a raiz não é órfã", () => {
    const paginas = new Map([
      pagina(`${BASE}/`),
      pagina(`${BASE}/a`, { titulo: "A", descricao: "da", links: ["/a"] }),
    ]);
    const orfas = diagnostica({ ...vazio, paginas }).filter((p) => p.tipo === "orfa");
    expect(orfas.map((p) => p.url)).toEqual([`${BASE}/a`]);
  });

  it("link interno para 404 é erro e para redirect é aviso, contando quem linka", () => {
    const paginas = new Map([pagina(`${BASE}/`, { links: ["/sumiu", "/blog/post"] })]);
    const alvosInternos = new Map([
      ["/sumiu", { status: 404 }],
      ["/blog/post", { status: 301, location: "/blog/post/" }],
    ]);
    const r = diagnostica({ paginas, alvosInternos, base: BASE });
    expect(r.find((p) => p.tipo === "link-interno-quebrado")).toMatchObject({
      severidade: "erro",
      url: `${BASE}/sumiu`,
    });
    expect(r.find((p) => p.tipo === "link-interno-redirect")?.detalhe).toContain(
      "301 para /blog/post/; linkado de 1 página(s)",
    );
  });

  it("link externo: 404 é aviso; robô barrado e falha de rede são só informativos", () => {
    const paginas = new Map([pagina(`${BASE}/`)]);
    const externos = new Map([
      ["https://ok.com/", { status: 200 }],
      ["https://morto.com/", { status: 404 }],
      ["https://gov.br/x", { status: 401 }],
      ["https://tls.com/", { status: 0, erro: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" }],
    ]);
    const r = diagnostica({ ...vazio, paginas, externos });
    expect(r.map((p) => `${p.severidade}:${p.tipo}:${p.url}`)).toEqual([
      "aviso:link-externo-quebrado:https://morto.com/",
      "info:externo-bloqueia-robo:https://gov.br/x",
      "info:externo-sem-resposta:https://tls.com/",
    ]);
  });
});

describe("relatorioMarkdown", () => {
  it("resume por tipo com erro primeiro e corta a lista no limite", () => {
    const problemas = [
      { severidade: "aviso", tipo: "orfa", url: "u1", detalhe: "d" },
      { severidade: "aviso", tipo: "orfa", url: "u2", detalhe: "d" },
      { severidade: "erro", tipo: "noindex", url: "u3", detalhe: "d" },
    ];
    const md = relatorioMarkdown({
      problemas,
      base: BASE,
      totalPaginas: 3,
      data: "2026-10-06",
      limite: 1,
    });
    expect(md).toContain("3 URLs do sitemap · 1 erros · 2 avisos");
    expect(md.indexOf("`noindex`")).toBeLessThan(md.indexOf("`orfa`"));
    expect(md).toContain("e mais 1 (lista completa no JSON)");
  });

  it("sem problema, diz isso", () => {
    expect(relatorioMarkdown({ problemas: [], base: BASE, totalPaginas: 1, data: "d" })).toContain(
      "Nenhum problema encontrado.",
    );
  });
});
