import { describe, expect, it, vi } from "vitest";
import worker from "./worker";
import legacySlugs from "./features/blog/legacy-slugs.json";

/**
 * Contrato das URLs do blog migradas do WordPress.
 *
 * Os 93 slugs em `legacy-slugs.json` foram congelados do `post-sitemap.xml` do
 * movepark.co. Eles respondem por 22,6% dos cliques orgânicos do site e nenhum
 * deles recebe backlink, então o que preserva o tráfego é a URL responder 200 com
 * o mesmo conteúdo, não uma cadeia de redirect.
 *
 * É este teste que impede alguém renomear um slug sem perceber que apagou uma
 * página que o Google conhece. Ver docs/specs/blog.md.
 */

const HTML = "<!DOCTYPE html><html><body>post</body></html>";

/** Simula o Pages: só existe o arquivo plano `/blog/<slug>` (o SSG emite .html). */
function makeEnv() {
  const served: string[] = [];
  const assets = {
    fetch: vi.fn(async (request: Request) => {
      served.push(new URL(request.url).pathname);
      return new Response(HTML, { status: 200, headers: { "Content-Type": "text/html" } });
    }),
  };
  return { env: { ASSETS: assets }, served };
}

const req = (path: string) => new Request(`https://hub.movepark.co${path}`);

describe("contrato de URL do blog", () => {
  it("o fixture tem os 93 slugs do sitemap do WordPress", () => {
    expect(legacySlugs).toHaveLength(93);
    expect(new Set(legacySlugs).size).toBe(93);
    expect(legacySlugs).toContain("top-3-estacionamentos-do-aeroporto-de-navegantes");
  });

  it("todo slug responde 200 na URL com barra, sem salto de redirect", async () => {
    const naoServidos: string[] = [];

    for (const slug of legacySlugs) {
      const { env, served } = makeEnv();
      const res = await worker.fetch(req(`/blog/${slug}/`), env);
      // 200 e nenhum redirect: a canônica do WordPress é com barra.
      if (res.status !== 200 || !served.includes(`/blog/${slug}`)) {
        naoServidos.push(`${slug} (status ${res.status})`);
      }
    }

    expect(naoServidos).toEqual([]);
  });

  it("todo slug sem a barra devolve 301 para a versão com barra", async () => {
    const errados: string[] = [];

    for (const slug of legacySlugs) {
      const { env } = makeEnv();
      const res = await worker.fetch(req(`/blog/${slug}`), env);
      if (res.status !== 301 || res.headers.get("Location") !== `/blog/${slug}/`) {
        errados.push(`${slug} -> ${res.status} ${res.headers.get("Location")}`);
      }
    }

    expect(errados).toEqual([]);
  });

  it("o índice /blog/ responde 200", async () => {
    const { env, served } = makeEnv();
    const res = await worker.fetch(req("/blog/"), env);
    expect(res.status).toBe(200);
    expect(served).toContain("/blog");
  });

  it("categoria vai para o destino do Hub, nas duas formas que o legado emitia", async () => {
    const casos: [string, string][] = [
      ["/blog/aeroporto-guarulhos/", "/destinos/aeroporto-internacional-de-sao-paulo-guarulhos"],
      ["/blog/categoria/aeroporto-guarulhos/", "/destinos/aeroporto-internacional-de-sao-paulo-guarulhos"],
      ["/blog/aeroporto-viracopos/", "/destinos/aeroporto-de-viracopos"],
      ["/blog/campinas/", "/destinos/aeroporto-de-viracopos"],
      ["/blog/viracopos/", "/destinos/aeroporto-de-viracopos"],
      ["/blog/guarulhos/", "/destinos/aeroporto-internacional-de-sao-paulo-guarulhos"],
      ["/blog/aeroporto-lisboa/", "/destinos/aeroporto-humberto-delgado"],
      ["/blog/aeroporto-confins/", "/destinos/aeroporto-de-confins"],
      ["/blog/aeroporto-congonhas/", "/destinos/aeroporto-de-congonhas"],
      ["/blog/aeroporto-afonso-pena/", "/destinos/aeroporto-afonso-pena"],
    ];

    for (const [from, to] of casos) {
      const { env } = makeEnv();
      const res = await worker.fetch(req(from), env);
      expect(res.status, from).toBe(301);
      expect(res.headers.get("Location"), from).toBe(to);
    }
  });

  it("categoria sem destino no Hub cai no índice do blog, não numa página genérica", async () => {
    // Navegantes ainda não existe como destino, e o post mais clicado do blog é dele.
    for (const path of ["/blog/aeroporto-navegantes/", "/blog/dica-de-viagem/", "/blog/duvidas/"]) {
      const { env } = makeEnv();
      const res = await worker.fetch(req(path), env);
      expect(res.status, path).toBe(301);
      expect(res.headers.get("Location"), path).toBe("/blog/");
    }
  });

  it("URL legada da raiz do domínio volta para o post no /blog/", async () => {
    // Vinha da tabela ko1_redirects: os posts moraram na raiz antes do prefixo /blog/.
    const casos: [string, string][] = [
      [
        "/quanto-custa-para-estacionar-no-aeroporto-viracopos/",
        "/blog/quanto-custa-para-estacionar-no-aeroporto-viracopos/",
      ],
      [
        "/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/",
        "/blog/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/",
      ],
      [
        "/aeroporto-guarulhos/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes",
        "/blog/estacionamento-proximo-do-aeroporto-guarulhos-as-melhores-opcoes/",
      ],
      [
        "/blog/ponce-park-descubra-se-o-estacionamento-aeroporto-gru-oferece-vagas-cobertas/",
        "/blog/aeropark-descubra-se-o-estacionamento-aeroporto-gru-oferece-vagas-cobertas/",
      ],
    ];

    for (const [from, to] of casos) {
      const { env } = makeEnv();
      const res = await worker.fetch(req(from), env);
      expect(res.status, from).toBe(301);
      expect(res.headers.get("Location"), from).toBe(to);
    }
  });

  it("serve o post em Markdown para agente que pede text/markdown (GEO)", async () => {
    // Crawler de IA não roda JavaScript. O .md gerado em public/blog/<slug>.md é o
    // que faz o post ser legível por agente; sem ele o pedido cai no llms.txt.
    const md = "# Top 3 estacionamentos\n\nconteudo";
    const assets = {
      fetch: vi.fn(async (request: Request) => {
        const { pathname } = new URL(request.url);
        if (pathname === "/blog/top-3-estacionamentos-do-aeroporto-de-viracopos.md") {
          return new Response(md, { status: 200, headers: { "Content-Type": "text/markdown" } });
        }
        return new Response("nao encontrado", { status: 404 });
      }),
    };

    const res = await worker.fetch(
      new Request("https://hub.movepark.co/blog/top-3-estacionamentos-do-aeroporto-de-viracopos/", {
        headers: { Accept: "text/markdown" },
      }),
      { ASSETS: assets },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/markdown");
    expect(await res.text()).toBe(md);
  });

  it("não sequestra rota fora do blog", async () => {
    for (const path of ["/destinos/aeroporto-de-viracopos", "/search", "/"]) {
      const { env } = makeEnv();
      const res = await worker.fetch(req(path), env);
      expect(res.status, path).toBe(200);
    }
  });

  it("todo destino apontado por categoria existe no mapa de destinos do Hub", async () => {
    // Um typo aqui manda tráfego real para um 404, e o teste acima não pegaria:
    // ele só compara com a string que este arquivo mesmo declara.
    const destinosDoHub = new Set([
      "aeroporto-internacional-de-sao-paulo-guarulhos",
      "aeroporto-de-viracopos",
      "aeroporto-afonso-pena",
      "aeroporto-humberto-delgado",
      "aeroporto-de-confins",
      "aeroporto-de-congonhas",
    ]);

    const categorias = [
      "aeroporto-guarulhos",
      "guarulhos",
      "aeroporto-viracopos",
      "viracopos",
      "campinas",
      "aeroporto-afonso-pena",
      "aeroporto-lisboa",
      "aeroporto-confins",
      "aeroporto-congonhas",
    ];

    for (const categoria of categorias) {
      const { env } = makeEnv();
      const res = await worker.fetch(req(`/blog/${categoria}/`), env);
      const destino = (res.headers.get("Location") ?? "").replace("/destinos/", "");
      expect(destinosDoHub.has(destino), `${categoria} -> ${destino}`).toBe(true);
    }
  });
});
