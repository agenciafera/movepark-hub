import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { __resetCachesDoWorker } from "./worker";

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

  // Regressão: path sem .md caía no fallback SPA (HTML 200) e o worker rotulava a
  // casca do app como text/markdown. O agente tem que receber o llms.txt.
  it("cai no llms.txt quando o .md não existe, nunca em HTML rotulado de markdown", async () => {
    const env = makeEnv({ "/llms.txt": { body: "# Movepark", type: "text/plain" } });
    const res = await worker.fetch(req("/faq", { Accept: "text/markdown" }), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type") ?? "").toContain("text/markdown");
    const body = await res.text();
    expect(body).not.toContain("<!DOCTYPE html>");
    expect(body).toContain("# Movepark");
  });

  it("serve o markdown da página de pergunta do FAQ", async () => {
    const env = makeEnv({
      "/faq/como-cancelo-uma-reserva.md": { body: "# Como cancelo", type: "text/markdown" },
    });
    const res = await worker.fetch(
      req("/faq/como-cancelo-uma-reserva", { Accept: "text/markdown" }),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type") ?? "").toContain("text/markdown");
    expect(await res.text()).toContain("# Como cancelo");
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

/**
 * 404 de verdade (docs/specs/borda-cloudflare.md).
 *
 * Este bloco fica no FIM do arquivo de propósito. O cache do manifesto vive no escopo do
 * módulo e o Vitest roda o arquivo inteiro numa instância só: um caso daqui que popule o
 * cache contaminaria os `describe` de cima, onde `/estacionamentos/a/b/c` exige 200 e não
 * está em manifesto nenhum. O `__resetCachesDoWorker` cobre o resto.
 */
describe("404 real de página", () => {
  const MANIFESTO = [
    "/",
    "/sobre",
    "/destinos/aeroporto-de-confins",
    "/blog/um-post",
    "/.well-known/api-catalog",
    "/404",
  ];
  const CORPO_404 = "<!DOCTYPE html><html><body>Essa página não existe</body></html>";

  /** ASSETS com manifesto e página de 404, mais o `auto-trailing-slash` do Workers Assets. */
  function envCom404(extra: Record<string, { body: string; type: string }> = {}) {
    const files: Record<string, { body: string; type: string }> = {
      "/paths-manifest.json": { body: JSON.stringify(MANIFESTO), type: "application/json" },
      "/404": { body: CORPO_404, type: "text/html" },
      ...extra,
    };
    const assets = {
      fetch: vi.fn(async (request: Request) => {
        const { pathname } = new URL(request.url);
        // O Workers Assets responde 307 para qualquer caminho terminado em .html, e é essa
        // armadilha que anulou a primeira implementação: buscar /404.html devolveria um
        // corpo VAZIO, e o worker carimbaria 404 numa tela branca. Medido em produção.
        if (/\.html$/i.test(pathname)) {
          const destino = pathname === "/index.html" ? "/" : pathname.slice(0, -".html".length);
          return new Response(null, { status: 307, headers: { Location: destino } });
        }
        const hit = files[pathname];
        if (hit) return new Response(hit.body, { status: 200, headers: { "Content-Type": hit.type } });
        return new Response(HTML, { status: 200, headers: { "Content-Type": "text/html" } });
      }),
    };
    return { ASSETS: assets };
  }

  afterEach(() => __resetCachesDoWorker());

  it("URL inexistente responde 404 com corpo, não 200 com a home", async () => {
    const res = await worker.fetch(req("/pagina-que-nao-existe-xyz"), envCom404());
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type") ?? "").toContain("text/html");
    expect(await res.text()).toContain("Essa página não existe");
  });

  it("o corpo do 404 não é vazio", async () => {
    // A primeira implementação buscava /404.html, recebia 307 sem corpo e servia tela branca.
    const res = await worker.fetch(req("/nada-aqui"), envCom404());
    expect((await res.text()).length).toBeGreaterThan(20);
  });

  it("página que existe continua 200", async () => {
    const res = await worker.fetch(req("/sobre"), envCom404());
    expect(res.status).toBe(200);
  });

  it("barra final e query string não mudam o veredicto", async () => {
    const comBarra = await worker.fetch(req("/destinos/aeroporto-de-confins/"), envCom404());
    expect(comBarra.status).toBe(200);
    const comQuery = await worker.fetch(req("/pagina-que-nao-existe-xyz?utm_source=x"), envCom404());
    expect(comQuery.status).toBe(404);
  });

  // ARMADILHA CENTRAL: estas rotas não têm arquivo no dist e vivem do fallback SPA. Medido
  // em produção: todas respondem hoje com o HTML da home byte a byte. Um 404 aqui não é
  // perda de ranking, é queda de produção.
  it.each([
    ["/checkout/MP-ABC123"],
    ["/bookings/MP-ABC123"],
    ["/account/reservas/MP-ABC123"],
    ["/manager/companies/1f0e/locations"],
    ["/manager/companies/1f0e/locations/9a2b/parking-types"],
    ["/operator/locations/9a2b/editar"],
    ["/operator/preview/9a2b"],
    ["/operator/pricing"],
    ["/onboarding"],
    ["/voucher/validate"],
  ])("rota de app sem HTML próprio continua 200: %s", async (caminho) => {
    const res = await worker.fetch(req(caminho), envCom404());
    expect(res.status).toBe(200);
  });

  it("/estacionamentos com 1 e 2 segmentos continua abrindo", async () => {
    // São as 24 páginas de aeroporto do WordPress. O checklist de migração pede 301 para
    // elas, não 404: mandar 404 jogaria fora a autoridade que o item existe para preservar.
    for (const caminho of ["/estacionamentos", "/estacionamentos/aeroporto-de-confins"]) {
      const res = await worker.fetch(req(caminho), envCom404());
      expect(res.status, caminho).toBe(200);
      __resetCachesDoWorker();
    }
  });

  it("caminho terminado em .html segue para o ASSETS e mantém o 307", async () => {
    // O manifesto guarda a chave sem extensão. Sem esta saída, /sobre.html não bateria em
    // nada e viraria 404, quebrando a canonicalização que existe hoje.
    const res = await worker.fetch(req("/sobre.html"), envCom404());
    expect(res.status).toBe(307);
  });

  it("arquivo sem extensão do .well-known continua 200", async () => {
    const res = await worker.fetch(req("/.well-known/api-catalog"), envCom404());
    expect(res.status).toBe(200);
  });

  it("/404 acessado direto responde 404, não 200", async () => {
    // Sem este desvio a própria página de erro vira um soft 404 indexável, porque o arquivo
    // existe e entra no manifesto.
    const res = await worker.fetch(req("/404"), envCom404());
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("Essa página não existe");
  });

  it("o 404 pede para não ser guardado em cache", async () => {
    // Sem no-store, uma URL que passa a existir fica presa em 404 na borda e no navegador
    // enquanto a migração do WordPress estiver em curso.
    const res = await worker.fetch(req("/nada-aqui"), envCom404());
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("agente pedindo markdown em URL inexistente recebe 404, não o llms.txt", async () => {
    const env = envCom404({ "/llms.txt": { body: "# Movepark", type: "text/markdown" } });
    const res = await worker.fetch(req("/nada-aqui", { Accept: "text/markdown" }), env);
    expect(res.status).toBe(404);
  });

  it("agente pedindo markdown em página real continua recebendo markdown", async () => {
    const env = envCom404({
      "/sobre.md": { body: "# Sobre", type: "text/markdown" },
      "/llms.txt": { body: "# Movepark", type: "text/markdown" },
    });
    const res = await worker.fetch(req("/sobre", { Accept: "text/markdown" }), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type") ?? "").toContain("text/markdown");
  });

  it("o 404 sai com noindex no hub e sem o header no domínio canônico", async () => {
    const noHub = await worker.fetch(req("/nada-aqui"), envCom404());
    expect(noHub.headers.get("X-Robots-Tag")).toBe("noindex, follow");
    expect(noHub.status).toBe(404);
    __resetCachesDoWorker();
    const noApex = await worker.fetch(req("/nada-aqui", undefined, "movepark.co"), envCom404());
    expect(noApex.headers.get("X-Robots-Tag")).toBeNull();
    expect(noApex.status).toBe(404);
    expect(await noApex.text()).toContain("Essa página não existe");
  });

  it("o manifesto é lido uma vez por isolate, não por requisição", async () => {
    const env = envCom404();
    await worker.fetch(req("/nada-1"), env);
    await worker.fetch(req("/nada-2"), env);
    const leituras = env.ASSETS.fetch.mock.calls.filter((c) =>
      new URL((c[0] as Request).url).pathname.endsWith("/paths-manifest.json"),
    );
    expect(leituras).toHaveLength(1);
  });

  // FAIL-OPEN: sem manifesto confiável a regra se desliga inteira. É obrigatório, não
  // cortesia: um build sem manifesto derrubaria o site em 404, e o pior caso tem que ser
  // voltar ao comportamento de hoje.
  it.each([
    ["manifesto ausente", {}],
    ["content-type errado", { "/paths-manifest.json": { body: "[]", type: "text/html" } }],
    ["json quebrado", { "/paths-manifest.json": { body: "{{{", type: "application/json" } }],
  ])("fail-open com %s: volta a responder 200", async (_nome, extra) => {
    const assets = {
      fetch: vi.fn(async (request: Request) => {
        const { pathname } = new URL(request.url);
        const files = extra as Record<string, { body: string; type: string }>;
        const hit = files[pathname];
        if (hit) return new Response(hit.body, { status: 200, headers: { "Content-Type": hit.type } });
        return new Response(HTML, { status: 200, headers: { "Content-Type": "text/html" } });
      }),
    };
    const res = await worker.fetch(req("/pagina-que-nao-existe-xyz"), { ASSETS: assets });
    expect(res.status).toBe(200);
  });

  it("asset ausente continua 404 de corpo vazio, que é o contrato do stale-build", async () => {
    const res = await worker.fetch(req("/assets/app-OLDHASH.js"), envCom404());
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
