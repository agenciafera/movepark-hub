import { describe, expect, it } from "vitest";

// Import atravessando a fronteira para `scripts/` de propósito: a lógica é de build e roda no
// `node` do encadeamento do `package.json`. Sem teste, o cálculo do delta ficaria sem
// cobertura, e é ele que decide o que é anunciado ao buscador e o que é reenvio indevido
// (que o protocolo pune com 429). A declaração de tipo mora em `scripts/indexnow.logic.d.mts`.
// Ver docs/specs/indexnow.md.
import {
  CHAVE,
  apenasDoHost,
  chaveValida,
  deveDisparar,
  lotes,
  montarPayload,
  shardsDoIndice,
  urlsDoSitemap,
  urlsParaSubmeter,
} from "../../scripts/indexnow.logic.mjs";

const url = (loc: string, lastmod: string | null = "2026-09-01T00:00:00.000Z") => ({ loc, lastmod });

function sitemapCom(urls: { loc: string; lastmod?: string }[]) {
  const blocos = urls
    .map((u) => `<url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset>${blocos}</urlset>`;
}

describe("chaveValida", () => {
  it("aceita a chave do projeto", () => {
    expect(chaveValida(CHAVE)).toBe(true);
  });

  it("recusa chave curta, longa demais ou com caractere fora do permitido", () => {
    expect(chaveValida("curta")).toBe(false);
    expect(chaveValida("a".repeat(129))).toBe(false);
    expect(chaveValida("chave_com_underline")).toBe(false);
    expect(chaveValida(undefined)).toBe(false);
  });
});

describe("urlsDoSitemap", () => {
  it("lê loc e lastmod", () => {
    const xml = sitemapCom([
      { loc: "https://movepark.co/", lastmod: "2026-09-01T00:00:00.000Z" },
      { loc: "https://movepark.co/precos" },
    ]);
    expect(urlsDoSitemap(xml)).toEqual([
      { loc: "https://movepark.co/", lastmod: "2026-09-01T00:00:00.000Z" },
      { loc: "https://movepark.co/precos", lastmod: null },
    ]);
  });

  it("devolve lista vazia para XML sem url", () => {
    expect(urlsDoSitemap("<urlset></urlset>")).toEqual([]);
    expect(urlsDoSitemap("")).toEqual([]);
  });
});

describe("shardsDoIndice", () => {
  it("lê os shards de um índice de sitemap", () => {
    const xml =
      '<?xml version="1.0"?><sitemapindex>' +
      "<sitemap><loc>https://movepark.co/sitemap-blog.xml</loc></sitemap>" +
      "<sitemap><loc>https://movepark.co/sitemap-faq.xml</loc></sitemap>" +
      "</sitemapindex>";
    expect(shardsDoIndice(xml)).toEqual([
      "https://movepark.co/sitemap-blog.xml",
      "https://movepark.co/sitemap-faq.xml",
    ]);
  });

  it("devolve vazio quando o XML é um sitemap comum, não um índice", () => {
    expect(shardsDoIndice(sitemapCom([{ loc: "https://movepark.co/" }]))).toEqual([]);
  });
});

describe("urlsParaSubmeter", () => {
  it("pega a URL nova", () => {
    const delta = urlsParaSubmeter([url("https://movepark.co/a"), url("https://movepark.co/b")], [
      url("https://movepark.co/a"),
    ]);
    expect(delta).toEqual(["https://movepark.co/b"]);
  });

  it("pega a URL cujo lastmod mudou", () => {
    const delta = urlsParaSubmeter(
      [url("https://movepark.co/a", "2026-09-02T00:00:00.000Z")],
      [url("https://movepark.co/a", "2026-09-01T00:00:00.000Z")],
    );
    expect(delta).toEqual(["https://movepark.co/a"]);
  });

  it("pega a URL que saiu do sitemap, para o buscador recrawlear e tirar do índice", () => {
    const delta = urlsParaSubmeter([url("https://movepark.co/a")], [
      url("https://movepark.co/a"),
      url("https://movepark.co/antiga"),
    ]);
    expect(delta).toEqual(["https://movepark.co/antiga"]);
  });

  it("não manda nada quando nada mudou, que é o caso de rebuild sem conteúdo novo", () => {
    const mesmas = [url("https://movepark.co/a"), url("https://movepark.co/b")];
    expect(urlsParaSubmeter(mesmas, mesmas)).toEqual([]);
  });

  it("não repete URL que mudou e sumiu de shards diferentes", () => {
    const delta = urlsParaSubmeter(
      [url("https://movepark.co/a", "novo"), url("https://movepark.co/a", "novo")],
      [url("https://movepark.co/a", "velho")],
    );
    expect(delta).toEqual(["https://movepark.co/a"]);
  });
});

describe("lotes", () => {
  it("respeita o teto do protocolo", () => {
    const urls = Array.from({ length: 25 }, (_, i) => `https://movepark.co/${i}`);
    expect(lotes(urls, 10).map((l) => l.length)).toEqual([10, 10, 5]);
  });

  it("lista vazia não vira lote nenhum", () => {
    expect(lotes([])).toEqual([]);
  });
});

describe("montarPayload", () => {
  it("monta o corpo com keyLocation apontando para a raiz", () => {
    expect(
      montarPayload({ host: "movepark.co", chave: "abc12345", urls: ["https://movepark.co/"] }),
    ).toEqual({
      host: "movepark.co",
      key: "abc12345",
      keyLocation: "https://movepark.co/abc12345.txt",
      urlList: ["https://movepark.co/"],
    });
  });
});

describe("deveDisparar", () => {
  it("dispara na publicação da main pelo Workers Builds", () => {
    expect(deveDisparar({ WORKERS_CI: "1", WORKERS_CI_BRANCH: "main" }).sim).toBe(true);
  });

  it("não dispara na máquina do dev nem no workflow do Lighthouse", () => {
    expect(deveDisparar({}).sim).toBe(false);
    // O Lighthouse roda `bun run build` no GitHub Actions, que marca CI mas não WORKERS_CI.
    expect(deveDisparar({ CI: "true", GITHUB_ACTIONS: "true" }).sim).toBe(false);
  });

  it("não dispara em build de branch, que não é o que está no ar", () => {
    expect(deveDisparar({ WORKERS_CI: "1", WORKERS_CI_BRANCH: "preview" }).sim).toBe(false);
  });

  it("--forcar passa por cima, para a submissão de estreia", () => {
    expect(deveDisparar({}, { forcar: true }).sim).toBe(true);
  });
});

describe("apenasDoHost", () => {
  it("descarta URL de outro host, que o protocolo recusa com 422", () => {
    expect(
      apenasDoHost(
        ["https://movepark.co/a", "https://garageinn.movepark.co/b", "nao-e-url"],
        "movepark.co",
      ),
    ).toEqual(["https://movepark.co/a"]);
  });
});
