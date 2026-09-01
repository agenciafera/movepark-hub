import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import worker, {
  ROTAS_PRIVADAS,
  __resetCachesDoWorker,
  ehRotaDeApp,
  ehRotaPrivada,
  normalizaBarraFinal,
  wpLegacyRedirect,
  blogRedirect,
} from "./worker";
import { SITEMAP_PRIVATE_PREFIXES } from "./lib/sitemapRoutes";

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

  // Consolidação por intenção: o perdedor responde 301 pro vencedor, com e sem barra.
  it("post consolidado redireciona 301 pro vencedor do grupo", async () => {
    const env = makeEnv({});
    for (const path of [
      "/blog/top-3-estacionamentos-do-aeroporto-de-viracopos/",
      "/blog/top-3-estacionamentos-do-aeroporto-de-viracopos",
    ]) {
      const res = await worker.fetch(req(path), env);
      expect(res.status).toBe(301);
      expect(res.headers.get("Location")).toBe(
        "/blog/quais-os-melhores-estacionamentos-do-aeroporto-viracopos-em-2024/",
      );
    }
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

describe("www redireciona para o apex", () => {
  it("301 para o apex, preservando caminho e query", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(
      req("/destinos/aeroporto-de-viracopos?src=email", undefined, "www.movepark.co"),
      env,
    );

    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe(
      "https://movepark.co/destinos/aeroporto-de-viracopos?src=email",
    );
  });

  it("a raiz do www também cai no apex", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(req("/", undefined, "www.movepark.co"), env);

    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("https://movepark.co/");
  });

  // O redirect roda ANTES do resto: no www não existe asset para buscar, e uma leitura
  // de asset ali seria trabalho jogado fora a cada request.
  it("não toca no ASSETS quando o host é www", async () => {
    const env = makeEnv({});
    await worker.fetch(req("/sobre", undefined, "www.movepark.co"), env);

    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  // A regra casa o host inteiro, não um prefixo: `www.movepark.co.evil.com` é outro
  // domínio, e mandar um 301 nosso para ele seria redirect aberto.
  it("não pega host que apenas começa com www.movepark.co", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(req("/", undefined, "www.movepark.co.evil.com"), env);

    expect(res.status).not.toBe(301);
  });

  it("o apex não é redirecionado", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(req("/", undefined, "movepark.co"), env);

    expect(res.status).toBe(200);
  });
});

describe("301 legado do WordPress (institucional, aeroporto, estacionamento)", () => {
  it("página institucional com nome trocado", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(req("/termos-de-uso"), env);

    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/termos");
  });

  // Depois da virada de URL, 12 dos 18 índices de aeroporto do WordPress SÃO o endereço do
  // Hub (`/estacionamentos/aeroporto-guarulhos`), então não há o que redirecionar: a entrada
  // some do mapa, porque redirecionar uma URL para ela mesma é loop.
  it("índice de aeroporto que virou o nosso endereço não redireciona", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(req("/estacionamentos/aeroporto-guarulhos"), env);

    expect(res.status).toBe(200);
  });

  it("índice de aeroporto com nome diferente do nosso continua em 301", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(req("/estacionamentos/aeroporto-afonso-pena"), env);

    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/estacionamentos/aeroporto-curitiba");
  });

  it("o caso ambíguo (RJ tem 2 aeroportos) vai para o índice do catálogo", async () => {
    const env = makeEnv({});
    const rio = await worker.fetch(req("/estacionamentos/rio-de-janeiro"), env);

    expect(rio.headers.get("Location")).toBe("/estacionamentos");
  });

  it("ficha de parceiro ativo do Hub vai direto para a ficha da unidade", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(
      req("/estacionamentos/aeroporto-viracopos/virapark-estacionamento-viracopos"),
      env,
    );

    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/estacionamentos/aeroporto-viracopos/virapark");
  });

  it("o alvo não cita tipo de vaga, que era o que envelhecia no mapa", async () => {
    // Regressão medida em produção em 21/08: o mapa (18/08) levava o Garageinn pro código
    // "uncovered", renomeado pra "avulsa" depois, e a URL respondia 200 com a casca da home.
    // Com uma ficha por unidade o alvo não tem tipo de vaga para envelhecer.
    const env = makeEnv({});
    const res = await worker.fetch(
      req("/estacionamentos/aeroporto-viracopos/garage-inn-aeroporto-viracopos"),
      env,
    );

    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/estacionamentos/aeroporto-viracopos/garageinn");
  });

  it("ficha de lote mapeado publicado vai para a ficha de vitrine equivalente", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(
      req("/estacionamentos/aeroporto-confins/park-confins-estacionamento-aeroporto-confins"),
      env,
    );

    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/estacionamentos/aeroporto-confins/park-confins");
  });

  it("ficha sem par confiável no Hub vai para o destino, nunca 404", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(
      req("/estacionamentos/aeroporto-congonhas/arai-park-cgh"),
      env,
    );

    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/estacionamentos/aeroporto-congonhas");
  });

  it("preserva a query string no redirect", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(req("/politica-de-privacidade?utm_source=teste"), env);

    expect(res.headers.get("Location")).toBe("/privacidade?utm_source=teste");
  });

  it("não pega caminho fora dos três mapas", async () => {
    const env = makeEnv({});
    const res = await worker.fetch(req("/estacionamentos/aeroporto-viracopos/marca-inexistente"), env);

    expect(res.status).not.toBe(301);
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
  Área privada fora do índice em qualquer host.

  O `noindex` de host é o que hoje esconde `/manager` e `/operator` do Google, e ele some no
  dia da migração para o apex. Estes casos são o que sobra depois disso: se algum quebrar
  junto com a entrada do `movepark.co` no `INDEXABLE_HOSTS`, o painel do parceiro e o checkout
  do cliente entram no índice no mesmo deploy.
*/
describe("noindex por rota nas áreas privadas", () => {
  const CANONICO = "movepark.co";

  it.each([...ROTAS_PRIVADAS])("%s responde noindex mesmo no domínio canônico", async (rota) => {
    const env = makeEnv({});
    const res = await worker.fetch(req(rota, undefined, CANONICO), env);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, follow");
  });

  it("vale nas subrotas, com barra final, em caixa alta e com query string", async () => {
    const env = makeEnv({});
    for (const rota of [
      "/manager/companies/abc/locations",
      "/operator/",
      "/Operator/api-keys",
      "/account/reservas/MP-TESTE123",
      "/checkout/MP-TESTE123?src=email",
      "/voucher/validate",
    ]) {
      const res = await worker.fetch(req(rota, undefined, CANONICO), env);
      expect(res.headers.get("X-Robots-Tag")).toBe("noindex, follow");
    }
  });

  // O prefixo casa caminho, não pedaço de palavra: uma página pública que comece com as
  // mesmas letras continua indexável.
  it("não pega rota pública de nome parecido", async () => {
    const env = makeEnv({});
    for (const rota of ["/", "/destinos", "/accounting", "/operadores", "/bookings-guia"]) {
      const res = await worker.fetch(req(rota, undefined, CANONICO), env);
      expect(res.headers.get("X-Robots-Tag")).toBeNull();
    }
  });

  it("vale também na resposta markdown pedida por agente", async () => {
    const env = makeEnv({ "/llms.txt": { body: "# Movepark", type: "text/plain" } });
    const res = await worker.fetch(
      req("/account/reservas", { Accept: "text/markdown" }, CANONICO),
      env,
    );
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, follow");
  });

  it("ehRotaPrivada separa privado de público", () => {
    expect(ehRotaPrivada("/manager")).toBe(true);
    expect(ehRotaPrivada("/onboarding/")).toBe(true);
    expect(ehRotaPrivada("/account/cards")).toBe(true);
    expect(ehRotaPrivada("/")).toBe(false);
    expect(ehRotaPrivada("/p/empresa/unidade/COD")).toBe(false);
    expect(ehRotaPrivada("/accountability")).toBe(false);
  });

  // Travado por NOME, e não derivado de outra lista, porque derivar foi justamente o erro:
  // a primeira versão deste guard leu `SITEMAP_PRIVATE_PREFIXES` e deu verde ao remover
  // `/descadastro`, que mora no opt-out do sitemap e não naquela lista. Guard derivado só
  // protege o que a fonte já conhece; estes caminhos precisam de uma afirmação própria.
  it.each([
    // As sete áreas logadas que a migração para o apex expôs. Estavam fora do Google só
    // porque o host inteiro respondia noindex.
    "/manager",
    "/operator",
    "/account",
    "/checkout",
    "/bookings",
    "/onboarding",
    "/voucher",
    // Carrega o destinatário em `?t=<token>`: indexar publica o token, não só a página.
    "/descadastro",
    // Retorno de autenticação.
    "/auth",
    // Ferramentas internas, públicas por descuido de roteamento.
    "/motor-preview",
    "/design-system",
  ])("%s nunca pode sair da lista de rotas privadas", (area) => {
    expect(ROTAS_PRIVADAS).toContain(area);
    expect(ehRotaPrivada(`${area}/qualquer/coisa`)).toBe(true);
  });

  // A direção INVERSA do guard abaixo, e a que faltava até 18/08/2026.
  //
  // `SITEMAP_PRIVATE_PREFIXES` é o que o build recusa no sitemap. Recusar ali só significa
  // "não anuncio"; não emite `noindex` nenhum. Enquanto o host inteiro respondia `noindex`,
  // a diferença não aparecia. Com o apex indexável, prefixo que está lá e não está aqui é
  // exatamente o buraco pelo qual o `/descadastro` (que carrega `?t=<token>` do destinatário)
  // ficou indexável.
  it("todo prefixo privado do sitemap também responde noindex", () => {
    expect(SITEMAP_PRIVATE_PREFIXES.length).toBeGreaterThan(0);

    for (const prefixo of SITEMAP_PRIVATE_PREFIXES) {
      expect(ehRotaPrivada(prefixo), `${prefixo} sai do sitemap mas não sai do índice`).toBe(true);
    }
  });

  // Duas listas descrevem a mesma decisão em lugares diferentes: esta, que tira do índice, e a
  // do pós-build, que tira do sitemap. Prefixo novo aqui e esquecido lá vira URL privada
  // anunciada ao buscador.
  it("todo prefixo privado também é recusado pelo sitemap", () => {
    const script = fs.readFileSync(
      path.resolve(__dirname, "../scripts/canonicalize-sitemap.mjs"),
      "utf-8",
    );
    const lista = script.match(/const PRIVADOS = \[([\s\S]*?)\]/)?.[1] ?? "";
    expect(lista).not.toBe("");
    for (const prefixo of ROTAS_PRIVADAS) {
      expect(lista).toContain(`"${prefixo}"`);
    }
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
function stubRpc(responder: () => Response | Promise<Response>) {
  const spy = vi.fn(async (input: unknown) => {
    const alvo = input instanceof Request ? input.url : String(input);
    if (!alvo.includes("/rest/v1/rpc/url_legacy_map")) {
      throw new Error(`fetch inesperado no teste: ${alvo}`);
    }
    return responder();
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

const MAPA = [
  { legacy_path: "/p/aeropark/aeroporto-guarulhos/covered", target_path: "/estacionamentos/aeroporto-guarulhos/aeropark", permanent: true },
  { legacy_path: "/destinos/aeroporto-internacional-de-sao-paulo-guarulhos", target_path: "/estacionamentos/aeroporto-guarulhos", permanent: true },
  { legacy_path: "/estacionamentos/aeroporto-de-confins/ipo-park-aeroporto-confins", target_path: "/estacionamentos/aeroporto-confins/ipo-park", permanent: true },
  { legacy_path: "/estacionamentos/aeroporto-de-confins/lote-sem-oferta", target_path: "/estacionamentos/aeroporto-confins", permanent: false },
];

/**
 * A virada de URL na borda (docs/specs/url-estacionamentos.md).
 *
 * O mapa vem do banco uma vez por isolate, e não uma consulta por URL como fazia a versão
 * anterior: depois da virada `/estacionamentos/*` é a rota principal do site.
 */
describe("301 das URLs antigas do Hub", () => {
  beforeEach(() => __resetCachesDoWorker());
  afterEach(() => vi.unstubAllGlobals());

  it("não toca na rede fora dos prefixos que podem ter URL antiga", async () => {
    const rpc = stubRpc(() => linhasRpc(MAPA));
    const res = await worker.fetch(req("/sobre"), envProspect());
    expect(rpc).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("colapsa as três URLs por tipo de vaga na ficha da unidade", async () => {
    stubRpc(() => linhasRpc(MAPA));
    const res = await worker.fetch(req("/p/aeropark/aeroporto-guarulhos/covered"), envProspect());
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/estacionamentos/aeroporto-guarulhos/aeropark");
  });

  it("leva o destino para a pasta nova", async () => {
    stubRpc(() => linhasRpc(MAPA));
    const res = await worker.fetch(
      req("/destinos/aeroporto-internacional-de-sao-paulo-guarulhos"),
      envProspect(),
    );
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/estacionamentos/aeroporto-guarulhos");
  });

  // Barra final tem dono: `normalizaBarraFinal` roda antes e canoniza. Aqui o que importa é
  // a query da busca sobreviver ao 301, senão o cliente perde as datas que escolheu.
  it("preserva a query da busca no redirecionamento", async () => {
    stubRpc(() => linhasRpc(MAPA));
    const res = await worker.fetch(
      req("/estacionamentos/aeroporto-de-confins/ipo-park-aeroporto-confins?from=2026-09-01"),
      envProspect(),
    );
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe(
      "/estacionamentos/aeroporto-confins/ipo-park?from=2026-09-01",
    );
  });

  it("302 quando o alvo ainda é provisório (ficha convertida sem oferta publicada)", async () => {
    stubRpc(() => linhasRpc(MAPA));
    const res = await worker.fetch(
      req("/estacionamentos/aeroporto-de-confins/lote-sem-oferta"),
      envProspect(),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("URL nova segue para o asset, sem redirecionamento", async () => {
    stubRpc(() => linhasRpc(MAPA));
    const res = await worker.fetch(
      req("/estacionamentos/aeroporto-guarulhos/aeropark"),
      envProspect(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type") ?? "").toContain("text/html");
  });

  // Prova que o bloco roda ANTES da negociação de conteúdo: senão o agente receberia o .md
  // do endereço velho em vez do 301.
  it("redireciona também quem pede text/markdown", async () => {
    stubRpc(() => linhasRpc(MAPA));
    const env = envProspect({
      "/p/aeropark/aeroporto-guarulhos/covered.md": { body: "# velho", type: "text/plain" },
    });
    const res = await worker.fetch(
      req("/p/aeropark/aeroporto-guarulhos/covered", { Accept: "text/markdown" }),
      env,
    );
    expect(res.status).toBe(301);
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("carrega o mapa uma vez por isolate, e não uma consulta por URL", async () => {
    const rpc = stubRpc(() => linhasRpc(MAPA));
    const env = envProspect();
    const a = await worker.fetch(req("/p/aeropark/aeroporto-guarulhos/covered"), env);
    const b = await worker.fetch(
      req("/destinos/aeroporto-internacional-de-sao-paulo-guarulhos"),
      env,
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(a.status).toBe(301);
    expect(b.status).toBe(301);
  });

  // O `br-parking-viracopos` ficou em loop de 301 em produção por causa de uma linha que
  // mandava a URL para ela mesma. A guarda existe no banco e de novo aqui.
  it("ignora linha que manda a URL para ela mesma", async () => {
    stubRpc(() =>
      linhasRpc([{ legacy_path: "/destinos/x", target_path: "/destinos/x", permanent: true }]),
    );
    const res = await worker.fetch(req("/destinos/x"), envProspect());
    expect(res.status).toBe(200);
  });

  it("serve a página normalmente quando a RPC cai, e não guarda a falha", async () => {
    const rpc = stubRpc(() => {
      throw new Error("rede fora");
    });
    const env = envProspect();
    const res = await worker.fetch(req("/p/aeropark/aeroporto-guarulhos/covered"), env);
    expect(res.status).toBe(200);
    await worker.fetch(req("/p/aeropark/aeroporto-guarulhos/covered"), env);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("serve a página normalmente quando a RPC responde 500", async () => {
    stubRpc(() => new Response("boom", { status: 500 }));
    const res = await worker.fetch(req("/p/aeropark/aeroporto-guarulhos/covered"), envProspect());
    expect(res.status).toBe(200);
  });

  it("serve a página normalmente quando a resposta vem num formato inesperado", async () => {
    stubRpc(() => linhasRpc([{ de: "/p/x", para: "/y" }]));
    const res = await worker.fetch(req("/p/aeropark/aeroporto-guarulhos/covered"), envProspect());
    expect(res.status).toBe(200);
  });

  it("não consulta a RPC sem as envs do Supabase", async () => {
    const rpc = stubRpc(() => linhasRpc(MAPA));
    const res = await worker.fetch(
      req("/p/aeropark/aeroporto-guarulhos/covered"),
      makeEnv({}),
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
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
    // Barra final deixou de servir cópia da página: 301 pra forma canônica, que é 200.
    const comBarra = await worker.fetch(req("/destinos/aeroporto-de-confins/"), envCom404());
    expect(comBarra.status).toBe(301);
    expect(comBarra.headers.get("Location")).toMatch(/\/destinos\/aeroporto-de-confins$/);
    const semBarra = await worker.fetch(req("/destinos/aeroporto-de-confins"), envCom404());
    expect(semBarra.status).toBe(200);
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

  it("/estacionamentos com 1 e 2 segmentos nunca 404, dentro ou fora do mapa", async () => {
    // `/estacionamentos` é o índice do catálogo desde a virada de URL, e era também uma das
    // páginas do WordPress: os dois lados falam o mesmo endereço, então ela abre (200) em vez
    // de redirecionar. `/estacionamentos/aeroporto-de-confins` usa o slug ANTIGO do Hub: sem
    // as envs do Supabase o mapa de 301 não carrega, e mesmo assim ela precisa abrir, não
    // virar 404.
    const bare = await worker.fetch(req("/estacionamentos"), envCom404());
    expect(bare.status).toBe(200);
    __resetCachesDoWorker();

    const foraDoMapa = await worker.fetch(req("/estacionamentos/aeroporto-de-confins"), envCom404());
    expect(foraDoMapa.status).toBe(200);
    __resetCachesDoWorker();
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

describe("conversa compartilhada, que deixou de existir", () => {
  /*
    O link publico de leitura saiu em 29/08/2026: a conversa passa a se levar em texto,
    pelo botao "Copiar conversa" da caixa de entrada. O teste fica para provar que a
    rota saiu inteira, e nao so' da tela: uma rota de app orfa continuaria devolvendo a
    casca do app com 200 num caminho que nao abre nada.
  */
  const TOKEN = "a".repeat(64);

  it("nao e' mais rota de app", () => {
    expect(ehRotaDeApp(`/conversa/${TOKEN}`)).toBe(false);
    expect(ehRotaDeApp("/conversa")).toBe(false);
  });
});

describe("barra final vira 301 pra forma canônica", () => {
  it("rota de app com barra redireciona permanente, preservando a query", () => {
    const r = normalizaBarraFinal(new URL("https://movepark.co/destinos/?foo=1"));
    expect(r?.status).toBe(301);
    expect(r?.headers.get("Location")).toBe("https://movepark.co/destinos?foo=1");
  });

  /** No blog o contrato de URL é o inverso: hub e posts vivem COM barra. */
  it("blog fica fora da normalização, e a raiz não tem o que normalizar", () => {
    expect(normalizaBarraFinal(new URL("https://movepark.co/blog/"))).toBeNull();
    expect(normalizaBarraFinal(new URL("https://movepark.co/blog/um-post/"))).toBeNull();
    expect(normalizaBarraFinal(new URL("https://movepark.co/"))).toBeNull();
    expect(normalizaBarraFinal(new URL("https://movepark.co/precos"))).toBeNull();
  });
});

describe("mapa do WordPress com entrada identidade", () => {
  /** A ficha que manteve o slug do WP redirecionava para ela mesma (loop infinito). */
  it("URL igual ao destino não redireciona: a página abre", () => {
    const r = wpLegacyRedirect(
      new URL("https://movepark.co/estacionamentos/aeroporto-de-viracopos/br-parking-viracopos"),
    );
    expect(r).toBeNull();
  });

  // Depois da virada de URL, este é o outro lado do mesmo caso: o slug do WordPress virou o
  // nosso endereço, então a entrada saiu do mapa e a página abre em vez de redirecionar.
  it("URL do WP que virou a nossa também não redireciona", () => {
    const r = wpLegacyRedirect(
      new URL("https://movepark.co/estacionamentos/aeroporto-viracopos/br-parking"),
    );
    expect(r).toBeNull();
  });

  it("URL do WP com nome diferente do nosso segue em 301", () => {
    const r = wpLegacyRedirect(
      new URL("https://movepark.co/estacionamentos/aeroporto-confins/park-confins-estacionamento-aeroporto-confins"),
    );
    expect(r?.status).toBe(301);
    expect(r?.headers.get("Location")).toBe("/estacionamentos/aeroporto-confins/park-confins");
  });
});

describe("feed do blog não entra no contrato de barra", () => {
  it("/blog/feed.xml passa direto pro asset, sem 301", () => {
    expect(blogRedirect(new URL("https://movepark.co/blog/feed.xml"))).toBeNull();
  });
});

describe("gêmeo markdown segue o mesmo mapa de consolidação do HTML", () => {
  /**
   * `/blog/<slug>.md` é o que agente de IA busca. Até 31/08/2026 ele ficava FORA do mapa,
   * junto do feed.xml, e o `.md` de um slug canibalizado respondia 200 com o artigo antigo
   * enquanto o HTML do mesmo slug já ia de 301 para o vencedor. A consolidação valia para o
   * Google e não valia para a IA, que é quem lê markdown.
   */
  it("slug consolidado leva o .md junto, para o .md do vencedor", () => {
    const r = blogRedirect(
      new URL("https://movepark.co/blog/5-vantagens-de-estacionar-no-aeroporto-de-curitiba.md"),
    );
    expect(r?.status).toBe(301);
    expect(r?.headers.get("Location")).toBe(
      "/blog/top-3-estacionamentos-do-aeroporto-de-curitiba.md",
    );
  });

  it("slug vivo em .md passa direto, sem 301", () => {
    expect(
      blogRedirect(
        new URL("https://movepark.co/blog/top-3-estacionamentos-do-aeroporto-de-curitiba.md"),
      ),
    ).toBeNull();
  });

  it("o feed continua fora disso", () => {
    expect(blogRedirect(new URL("https://movepark.co/blog/feed.xml"))).toBeNull();
  });
});
