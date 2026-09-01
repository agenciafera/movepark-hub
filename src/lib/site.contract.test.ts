import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { SITE_URL } from "./site";
import { DEFAULT_SITE_URL } from "./site-host.mjs";

/**
 * O domínio canônico tem que ter um lugar só.
 *
 * Em 18/08/2026, quando o site saiu de `hub.movepark.co` para `movepark.co`, a string estava
 * escrita à mão em 399 pontos do repo: 44 em `src/` (canonical, og:url, JSON-LD), sete
 * fallbacks de Edge Function, o hostname do sitemap, o `robots.txt`, o `llms.txt`, os
 * `.well-known/*` e o corpus de Markdown que as IAs leem. Canonical apontando para host
 * desativado é o que tira o site do índice, e um `og:url` esquecido não dá erro em lugar
 * nenhum: só some do Google semanas depois.
 *
 * Três runtimes não conseguem importar um do outro (Vite/TS, node puro nos scripts, Deno nas
 * Edges), então o valor mora em dois arquivos e este teste solda os dois. Ver
 * docs/specs/seo-indexacao.md.
 */

const RAIZ = process.cwd();

/** O host do site, nas duas formas que já valeram. Subdomínio de serviço não conta. */
const HOST_DO_SITE = /https:\/\/(?:hub\.)?movepark\.co/;
const HOST_ANTIGO = /hub\.movepark\.co/;

/**
 * Arquivos versionados sob os caminhos dados.
 *
 * Recebe DIRETÓRIO, e a extensão é filtrada aqui. A primeira versão passava
 * `src/**\/*.ts` para o `git ls-files` e isso tem um buraco silencioso: nessa forma o
 * pathspec não casa arquivo na RAIZ de `src/`, então `api-worker.ts` e `worker.ts` nunca
 * eram lidos. O teste passava verde com quatro links mortos servidos na página pública do
 * `mcp.movepark.co`. Guard que não enxerga o arquivo é pior que guard nenhum, porque dá
 * confiança falsa.
 */
function arquivos(padroes: string[], extensoes?: string[]): string[] {
  const saida = execSync(`git ls-files ${padroes.map((p) => `'${p}'`).join(" ")}`, {
    cwd: RAIZ,
    encoding: "utf8",
  });
  const todos = saida.split("\n").filter(Boolean);
  if (!extensoes) return todos;
  return todos.filter((f) => extensoes.some((e) => f.endsWith(e)));
}

const ler = (f: string) => readFileSync(`${RAIZ}/${f}`, "utf8");

/**
 * O mesmo arquivo, sem as linhas de comentário.
 *
 * A regra é sobre URL que o app EMITE, não sobre prosa. Vários comentários citam o host
 * antigo de propósito, explicando o bug que a centralização resolveu, e apagar essa memória
 * para agradar um regex tornaria o código pior.
 */
function semComentarios(f: string): string {
  return ler(f)
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");
}

/** Onde o literal é a própria definição, e não uma cópia. */
const FONTES_DO_VALOR = new Set(["src/lib/site-host.mjs", "src/lib/site.contract.test.ts"]);

describe("domínio canônico", () => {
  it("o front e o Deno declaram o mesmo host", () => {
    const deno = ler("supabase/functions/_shared/site.ts");
    const hostDoDeno = deno.match(/DEFAULT_SITE_URL = "([^"]+)"/)?.[1];

    expect(hostDoDeno).toBe(DEFAULT_SITE_URL);
  });

  it("SITE_URL não termina em barra", () => {
    expect(SITE_URL).not.toMatch(/\/$/);
    expect(SITE_URL).toBe(DEFAULT_SITE_URL);
  });

  // Regressão do buraco de 18/08/2026: a varredura precisa enxergar a RAIZ de src/, não só
  // as subpastas. Sem esta asserção, um pathspec errado volta a esvaziar a lista em silêncio
  // e todos os testes abaixo passam sem ler nada.
  it("a varredura alcança a raiz de src/, e não só as subpastas", () => {
    const fontes = arquivos(["src"], [".ts", ".tsx", ".mjs"]);

    expect(fontes).toContain("src/api-worker.ts");
    expect(fontes).toContain("src/worker.ts");
    expect(fontes).toContain("src/lib/site.ts");
    expect(fontes.length).toBeGreaterThan(300);
  });

  it("nenhuma fonte de src/ escreve o host à mão", () => {
    const infratores = arquivos(["src"], [".ts", ".tsx", ".mjs"])
      .filter((f) => !f.includes(".test."))
      .filter((f) => !FONTES_DO_VALOR.has(f))
      .filter((f) => HOST_DO_SITE.test(semComentarios(f)));

    expect(infratores, "importe SITE_URL de @/lib/site em vez de repetir o host").toEqual([]);
  });

  it("nenhuma Edge Function escreve o host à mão", () => {
    const infratores = arquivos(["supabase/functions"], [".ts"])
      .filter((f) => !f.includes(".test.") && f !== "supabase/functions/_shared/site.ts")
      .filter((f) => HOST_DO_SITE.test(semComentarios(f)));

    expect(infratores, "importe siteUrl() de _shared/site.ts").toEqual([]);
  });

  // O `wrangler.jsonc` é config JSON: a route não consegue interpolar constante, então o host
  // ali é literal por força. Esta asserção é o que impede o literal de sobreviver a uma troca
  // de domínio; sem ela, o `www` de um domínio velho continuaria roteado e o do novo, não.
  it("a route do www no wrangler acompanha o host canônico", () => {
    const cfg = ler("wrangler.jsonc");
    const host = new URL(DEFAULT_SITE_URL).hostname;
    const patterns = [...cfg.matchAll(/"pattern":\s*"([^"]+)"/g)].map((m) => m[1]);

    expect(patterns).toContain(`www.${host}/*`);
  });

  it("a superfície publicada não cita o host antigo", () => {
    const infratores = arquivos([
      "public/robots.txt",
      "public/llms.txt",
      "public/openapi.yaml",
      "public/auth.md",
      "public/.well-known",
      "supabase/templates/auth",
    ]).filter((f) => HOST_ANTIGO.test(ler(f)));

    expect(infratores, "arquivo estático precisa ser trocado à mão na migração").toEqual([]);
  });

  /**
   * O gêmeo Markdown do post é GERADO do banco desde 31/08/2026, e o guard contra host
   * antigo mora no `generate-geo-artifacts.mjs`, que lê a mesma fonte da página.
   *
   * Antes eram arquivos versionados aqui, e este teste lia O ARQUIVO: quando o `.md` do
   * post de Confins foi corrigido à mão e o `body_md` não, o teste ficou verde enquanto a
   * página servia o host antigo. Guard que aponta para o artefato, e não para a fonte, dá
   * confiança falsa. O que sobra aqui é impedir a volta do arquivo versionado.
   */
  it("não existe gêmeo Markdown versionado: ele é gerado do banco", () => {
    expect(arquivos(["public/blog"], [".md"])).toEqual([]);
  });
});
