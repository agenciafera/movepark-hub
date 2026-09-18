import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { __resetCachesDoWorker } from "./worker";

/**
 * Contrato das URLs do site antigo fora do blog: um salto só, e nunca para outro salto.
 *
 * Medido em produção em 18/09/2026, contra as 581 URLs do apex no baseline do Search
 * Console de 24/08: 41 chegavam ao destino em dois saltos (a barra final era normalizada
 * antes do mapa do WordPress, então a URL de maior tráfego do site antigo pagava um 301 a
 * mais), e 20 das 40 regras do plugin Redirection do WordPress respondiam 404, entre elas a
 * de maior volume da tabela. Ver docs/specs/seo-indexacao.md.
 *
 * Os dois arquivos de entrada são os que o repositório já guarda: o baseline do Search
 * Console (`paginas.csv`) e a tabela do plugin (`ko1_redirects.csv`). Quem acrescentar um
 * mapa que aponte para outro endereço antigo, ou mexer na ordem da borda, reprova aqui.
 */

const RAIZ = path.resolve(__dirname, "..");
const HTML = "<!DOCTYPE html><html><body>app</body></html>";

/** Asset sempre servido: sem manifesto e sem Supabase, a borda fica no modo fail-open. */
function makeEnv() {
  const assets = {
    fetch: vi.fn(
      async () => new Response(HTML, { status: 200, headers: { "Content-Type": "text/html" } }),
    ),
  };
  return { ASSETS: assets };
}

const req = (caminho: string) => new Request(`https://movepark.co${caminho}`);

/** Caminho relativo de um `Location`, que pode vir absoluto (barra final) ou relativo (mapas). */
const caminhoDe = (location: string) => {
  const u = new URL(location, "https://movepark.co");
  return u.pathname + u.search;
};

function lerCsv(relativo: string): string[][] {
  return fs
    .readFileSync(path.join(RAIZ, relativo), "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((linha) => linha.split(",").map((c) => c.replace(/^"|"$/g, "")));
}

/** URLs do apex no baseline de 24/08, o retrato mais próximo do corte do WordPress. */
const doBaseline = lerCsv("docs/specs/dados/gsc-baseline-2026-08-24/paginas.csv")
  .map(([pagina]) => new URL(pagina))
  .filter((u) => u.hostname === "movepark.co")
  .map((u) => u.pathname + u.search)
  // Imagem do WordPress não tem equivalente e segue em 404, de propósito.
  .filter((c) => !c.includes("/wp-content/"));

/** Regras do plugin Redirection (`id,url_from,...`). A origem vem sem a barra inicial. */
const doPlugin = [
  ...new Set(
    lerCsv("docs/specs/wp-inventory/ko1_redirects.csv").map(([, de]) => `/${de.replace(/^\/+/, "")}`),
  ),
];

afterEach(() => __resetCachesDoWorker());

describe("contrato das URLs legadas do WordPress fora do blog", () => {
  it("os arquivos de entrada estão lá e têm o tamanho medido", () => {
    expect(doBaseline.length).toBeGreaterThan(500);
    expect(doPlugin).toHaveLength(40);
  });

  it("nenhuma URL do site antigo faz dois saltos", async () => {
    const cadeias: string[] = [];

    for (const de of [...doBaseline, ...doPlugin]) {
      const primeira = await worker.fetch(req(de), makeEnv());
      if (primeira.status < 300 || primeira.status >= 400) continue;

      const alvo = caminhoDe(primeira.headers.get("Location") ?? "");
      const segunda = await worker.fetch(req(alvo), makeEnv());
      if (segunda.status >= 300 && segunda.status < 400) {
        cadeias.push(`${de} -> ${alvo} -> ${segunda.headers.get("Location")}`);
      }
    }

    expect(cadeias).toEqual([]);
  });

  it("toda regra do plugin Redirection responde 301", async () => {
    // O modo fail-open devolveria 200 com a casca do app, que em produção é 404 ou soft 404.
    // Por isso a checagem é pelo 301 e não pela ausência de 404.
    const semSalto: string[] = [];
    for (const de of doPlugin) {
      const res = await worker.fetch(req(de), makeEnv());
      if (res.status !== 301) semSalto.push(`${de} (status ${res.status})`);
    }
    expect(semSalto).toEqual([]);
  });
});

describe("casos que estavam quebrados em 18/09/2026", () => {
  it.each([
    // Dois saltos: a barra final ia antes do mapa
    [
      "/estacionamentos/aeroporto-viracopos/virapark-estacionamento-viracopos/",
      "/estacionamentos/aeroporto-viracopos/virapark",
    ],
    ["/estacionamentos/aeroporto-afonso-pena/", "/estacionamentos/aeroporto-curitiba"],
    // 404: regra do plugin Redirection que ninguém tinha portado
    ["/estacionamento/ponce-park-guarulhos/", "/estacionamentos/aeroporto-guarulhos/ponce-park"],
    [
      "/estacionamentos/aeroporto-guarulhos/ponce-park-guarulhos/",
      "/estacionamentos/aeroporto-guarulhos/ponce-park",
    ],
    ["/estacionamento/nation-park-aeroporto-afonso-pena/", "/estacionamentos/aeroporto-curitiba/nationpark"],
    ["/campinas", "/estacionamentos/aeroporto-viracopos"],
    // 404: ficha debaixo de apelido de destino
    [
      "/estacionamentos/campinas/virapark-estacionamento-viracopos/",
      "/estacionamentos/aeroporto-viracopos/virapark",
    ],
    // 200 com a casca da home: apelido de destino na pasta do catálogo
    ["/estacionamentos/campinas/", "/estacionamentos/aeroporto-viracopos"],
    ["/estacionamentos/aeroporto-afonsopena", "/estacionamentos/aeroporto-curitiba"],
    // 404: `)` colado de link em Markdown
    [
      "/estacionamentos/aeroporto-viracopos/garage-inn-aeroporto-viracopos/)",
      "/estacionamentos/aeroporto-viracopos/garageinn",
    ],
  ])("%s vai para %s num salto", async (de, para) => {
    const res = await worker.fetch(req(de), makeEnv());
    expect(res.status).toBe(301);
    expect(caminhoDe(res.headers.get("Location") ?? "")).toBe(para);
  });

  it("variante de slug que o mapa não lista, debaixo de destino do WordPress, cai no destino", async () => {
    const res = await worker.fetch(
      req("/estacionamentos/aeroporto-afonso-pena/qualquer-variante-que-o-crawler-guardou/"),
      makeEnv(),
    );
    expect(caminhoDe(res.headers.get("Location") ?? "")).toBe("/estacionamentos/aeroporto-curitiba");
  });

  it("página do destino debaixo de apelido vai para a página equivalente, não para a raiz", async () => {
    const res = await worker.fetch(req("/estacionamentos/aeroporto-afonso-pena/precos"), makeEnv());
    expect(caminhoDe(res.headers.get("Location") ?? "")).toBe(
      "/estacionamentos/aeroporto-curitiba/precos",
    );
  });

  it("ficha desconhecida debaixo de destino do Hub não é tocada pelo apelido", async () => {
    const res = await worker.fetch(
      req("/estacionamentos/aeroporto-viracopos/marca-inexistente"),
      makeEnv(),
    );
    expect(res.status).not.toBe(301);
  });

  it("a barra final continua sendo normalizada quando nenhum mapa conhece a URL", async () => {
    const res = await worker.fetch(req("/faq/?x=1"), makeEnv());
    expect(res.status).toBe(301);
    expect(caminhoDe(res.headers.get("Location") ?? "")).toBe("/faq?x=1");
  });

  it("`)` colado numa URL sem mapa só perde a pontuação", async () => {
    const res = await worker.fetch(req("/faq)"), makeEnv());
    expect(res.status).toBe(301);
    expect(caminhoDe(res.headers.get("Location") ?? "")).toBe("/faq");
  });
});
