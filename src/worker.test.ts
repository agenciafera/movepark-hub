import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./worker";

const HTML = "<!DOCTYPE html><html><head></head><body>app</body></html>";

/** Simula o `env.ASSETS` do Cloudflare com `not_found_handling: single-page-application`:
 *  arquivos conhecidos voltam com seu content-type; qualquer outro cai no index.html (HTML 200). */
function makeEnv(files: Record<string, { body: string; type: string }>) {
  const assets = {
    fetch: vi.fn(async (request: Request) => {
      const { pathname } = new URL(request.url);
      const hit = files[pathname];
      if (hit) {
        return new Response(hit.body, { status: 200, headers: { "Content-Type": hit.type } });
      }
      // fallback SPA: sempre HTML 200
      return new Response(HTML, { status: 200, headers: { "Content-Type": "text/html" } });
    }),
  };
  return { ASSETS: assets };
}

function req(path: string, headers?: Record<string, string>, host = "hub.movepark.co") {
  return new Request(`https://${host}${path}`, { headers });
}

describe("worker asset fallback", () => {
  it("devolve 404 (não HTML) para asset com hash que sumiu", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(req("/static-loader-data-manifest-OLDHASH.json"), env);
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type") ?? "").not.toContain("text/html");
  });

  it("devolve 404 para um chunk .js com hash antigo ausente", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(req("/assets/app-OLD.js"), env);
    expect(res.status).toBe(404);
  });

  it("repassa um asset real com o content-type correto", async () => {
    const env = makeEnv({
      "/assets/app-NEW.js": { body: "console.log(1)", type: "application/javascript" },
    });
    const res = await worker.fetch(req("/assets/app-NEW.js"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("javascript");
    expect(await res.text()).toContain("console.log");
  });

  it("repassa navegação de rota (sem extensão) como HTML", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(req("/destinos"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type") ?? "").toContain("text/html");
  });

  it("serve markdown quando o agente pede text/markdown", async () => {
    const env = makeEnv({
      "/destinos.md": { body: "# Destinos", type: "text/plain" },
    });
    const res = await worker.fetch(req("/destinos", { Accept: "text/markdown" }), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type") ?? "").toContain("text/markdown");
    expect(await res.text()).toContain("# Destinos");
  });
});

describe("política de indexação por host", () => {
  it("marca noindex no subdomínio do Hub", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(req("/destinos"), env);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, follow");
  });

  // O Hub vai assumir o `movepark.co`. Se este teste quebrar, a migração vai subir
  // o site novo com noindex e ele nunca entra no Google.
  it("NÃO marca noindex no domínio canônico", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(req("/destinos", undefined, "movepark.co"), env);
    expect(res.headers.get("X-Robots-Tag")).toBeNull();
    expect(res.status).toBe(200);
  });

  it("marca noindex nos hosts de preview do Cloudflare", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(req("/", undefined, "movepark-hub.pages.dev"), env);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, follow");
  });

  it("marca noindex também na resposta markdown dos agentes", async () => {
    const env = makeEnv({ "/sobre.md": { body: "# Sobre", type: "text/plain" } });
    const res = await worker.fetch(req("/sobre", { Accept: "text/markdown" }), env);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, follow");
    expect(res.headers.get("Content-Type") ?? "").toContain("text/markdown");
  });

  it("preserva corpo e content-type ao acrescentar o header", async () => {
    const env = makeEnv({
      "/assets/app-NEW.js": { body: "console.log(1)", type: "application/javascript" },
    });
    const res = await worker.fetch(req("/assets/app-NEW.js"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("javascript");
    expect(await res.text()).toContain("console.log");
  });

  it("não quebra a resposta 404 sem corpo", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(req("/assets/app-OLD.js"), env);
    expect(res.status).toBe(404);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, follow");
  });
});

/*
  Ficha de lote mapeado que virou parceiro.

  O cache do alvo vive no escopo do módulo e não é resetado entre testes (não existe
  API para isso, e criar uma só para o teste seria abrir o worker por causa da suíte).
  Por isso cada caso usa um slug próprio: dois testes com o mesmo slug se contaminariam
  pelo cache, e o teste de cache é justamente o que reusa o slug de propósito.
*/
const SUPA = { SUPABASE_URL: "https://projeto.supabase.co", SUPABASE_ANON_KEY: "anon-de-teste" };

function envProspect(files: Record<string, { body: string; type: string }> = {}) {
  return { ...makeEnv(files), ...SUPA };
}

const linhasRpc = (linhas: unknown[]) =>
  new Response(JSON.stringify(linhas), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

/** Troca o `fetch` global, que é por onde o Worker fala com a RPC do Supabase. */
function stubRpc(responder: (body: Record<string, unknown>) => Response | Promise<Response>) {
  const spy = vi.fn(async (input: unknown, init?: RequestInit) => {
    const alvo = input instanceof Request ? input.url : String(input);
    if (!alvo.includes("/rest/v1/rpc/prospect_redirect_target")) {
      throw new Error(`fetch inesperado no teste: ${alvo}`);
    }
    return responder(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("redirecionamento de ficha convertida", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("não toca na rede fora de /estacionamentos", async () => {
    const rpc = stubRpc(() => linhasRpc([]));
    const res = await worker.fetch(req("/destinos/aeroporto-de-confins"), envProspect());
    expect(rpc).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("não dispara em caminho com 2 ou 4 segmentos sob /estacionamentos", async () => {
    const rpc = stubRpc(() => linhasRpc([]));
    const env = envProspect();
    const dois = await worker.fetch(req("/estacionamentos/aeroporto-de-confins"), env);
    const quatro = await worker.fetch(req("/estacionamentos/a/b/c"), env);
    expect(rpc).not.toHaveBeenCalled();
    expect(dois.status).toBe(200);
    expect(quatro.status).toBe(200);
  });

  it("deixa a ficha não convertida seguir para o asset", async () => {
    const rpc = stubRpc(() => linhasRpc([]));
    const env = envProspect();
    const res = await worker.fetch(req("/estacionamentos/aeroporto-de-confins/lote-livre"), env);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type") ?? "").toContain("text/html");
  });

  it("manda 301 para a unidade quando ela já está listada", async () => {
    const rpc = stubRpc((body) => {
      expect(body).toEqual({
        p_destination_slug: "aeroporto-de-confins",
        p_slug: "lote-listado",
      });
      return linhasRpc([{ target: "/p/mercy/mercy-confins/coberto", permanent: true }]);
    });
    const res = await worker.fetch(
      req("/estacionamentos/aeroporto-de-confins/lote-listado"),
      envProspect(),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/p/mercy/mercy-confins/coberto");
  });

  it("manda 302 para o destino enquanto a unidade não está listada", async () => {
    stubRpc(() => linhasRpc([{ target: "/destinos/aeroporto-de-confins", permanent: false }]));
    const res = await worker.fetch(
      req("/estacionamentos/aeroporto-de-confins/lote-sem-oferta"),
      envProspect(),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/destinos/aeroporto-de-confins");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("aceita a barra final na URL da ficha", async () => {
    stubRpc((body) => {
      expect(body.p_slug).toBe("lote-com-barra");
      return linhasRpc([{ target: "/p/mercy/mercy-confins/coberto", permanent: true }]);
    });
    const res = await worker.fetch(
      req("/estacionamentos/aeroporto-de-confins/lote-com-barra/"),
      envProspect(),
    );
    expect(res.status).toBe(301);
  });

  // Prova que o bloco roda ANTES da negociação de conteúdo. Se ele descesse na ordem,
  // o agente receberia o .md velho dizendo que o lote não aceita reserva.
  it("redireciona também quem pede text/markdown", async () => {
    stubRpc(() => linhasRpc([{ target: "/p/mercy/mercy-confins/coberto", permanent: true }]));
    const env = envProspect({
      "/estacionamentos/aeroporto-de-confins/lote-md.md": { body: "# velho", type: "text/plain" },
    });
    const res = await worker.fetch(
      req("/estacionamentos/aeroporto-de-confins/lote-md", { Accept: "text/markdown" }),
      env,
    );
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/p/mercy/mercy-confins/coberto");
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("serve a página normalmente quando a RPC cai (fetch rejeita)", async () => {
    const rpc = stubRpc(() => {
      throw new Error("rede fora");
    });
    const env = envProspect();
    const res = await worker.fetch(req("/estacionamentos/aeroporto-de-confins/lote-rede"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type") ?? "").toContain("text/html");
    // Falha não entra em cache: senão um soluço da rede desligaria a regra até o
    // isolate morrer.
    await worker.fetch(req("/estacionamentos/aeroporto-de-confins/lote-rede"), env);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("serve a página normalmente quando a RPC responde 500", async () => {
    stubRpc(() => new Response("boom", { status: 500 }));
    const res = await worker.fetch(
      req("/estacionamentos/aeroporto-de-confins/lote-500"),
      envProspect(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type") ?? "").toContain("text/html");
  });

  it("serve a página normalmente quando a resposta vem num formato inesperado", async () => {
    stubRpc(() => linhasRpc([{ alvo: "/p/x", eterno: 1 }]));
    const res = await worker.fetch(
      req("/estacionamentos/aeroporto-de-confins/lote-torto"),
      envProspect(),
    );
    expect(res.status).toBe(200);
  });

  it("não consulta a RPC sem as envs do Supabase", async () => {
    const rpc = stubRpc(() => linhasRpc([]));
    const res = await worker.fetch(
      req("/estacionamentos/aeroporto-de-confins/lote-sem-env"),
      makeEnv({}),
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("cacheia o alvo e não consulta a RPC de novo na mesma URL", async () => {
    const rpc = stubRpc(() =>
      linhasRpc([{ target: "/p/mercy/mercy-gru/coberto", permanent: true }]),
    );
    const env = envProspect();
    const caminho = "/estacionamentos/aeroporto-de-confins/lote-cacheado";
    const primeira = await worker.fetch(req(caminho), env);
    const segunda = await worker.fetch(req(caminho), env);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(primeira.status).toBe(301);
    expect(segunda.status).toBe(301);
    expect(segunda.headers.get("Location")).toBe("/p/mercy/mercy-gru/coberto");
  });
});
