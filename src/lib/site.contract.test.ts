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

function arquivos(...padroes: string[]): string[] {
  const saida = execSync(`git ls-files ${padroes.map((p) => `'${p}'`).join(" ")}`, {
    cwd: RAIZ,
    encoding: "utf8",
  });
  return saida.split("\n").filter(Boolean);
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

  it("nenhuma fonte de src/ escreve o host à mão", () => {
    const infratores = arquivos("src/**/*.ts", "src/**/*.tsx", "src/**/*.mjs")
      .filter((f) => !f.includes(".test."))
      .filter((f) => !FONTES_DO_VALOR.has(f))
      .filter((f) => HOST_DO_SITE.test(semComentarios(f)));

    expect(infratores, "importe SITE_URL de @/lib/site em vez de repetir o host").toEqual([]);
  });

  it("nenhuma Edge Function escreve o host à mão", () => {
    const infratores = arquivos("supabase/functions/**/*.ts")
      .filter((f) => !f.includes(".test.") && f !== "supabase/functions/_shared/site.ts")
      .filter((f) => HOST_DO_SITE.test(semComentarios(f)));

    expect(infratores, "importe siteUrl() de _shared/site.ts").toEqual([]);
  });

  it("a superfície publicada não cita o host antigo", () => {
    const infratores = arquivos(
      "public/robots.txt",
      "public/llms.txt",
      "public/openapi.yaml",
      "public/auth.md",
      "public/.well-known/**",
      "supabase/templates/auth/*.html",
    ).filter((f) => HOST_ANTIGO.test(ler(f)));

    expect(infratores, "arquivo estático precisa ser trocado à mão na migração").toEqual([]);
  });

  it("o corpus Markdown do blog não cita o host antigo", () => {
    const infratores = arquivos("public/blog/*.md").filter((f) => HOST_ANTIGO.test(ler(f)));

    expect(infratores.length, `${infratores.length} posts com host antigo`).toBe(0);
  });
});
