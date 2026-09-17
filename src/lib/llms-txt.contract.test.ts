import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { rotasDeclaradas } from "@/test/rotas";

/**
 * O `llms.txt` é o primeiro arquivo que um agente lê antes de decidir como consumir o
 * site, e é escrito à mão: nada no build confere se o endereço citado ali ainda existe.
 *
 * O custo apareceu em 16/09/2026, na entrega de Conteúdo 25. A migração de URL de
 * agosto moveu a intenção "mais barato" para dentro da pasta do destino, e o `llms.txt`
 * seguiu citando `/estacionamento-mais-barato/<slug>` por semanas. Para quem lê HTML
 * isso é um 301 invisível; para um agente que pede `Accept: text/markdown` numa URL
 * inexistente, é o `llms.txt` genérico de volta em vez da tabela de preço pedida, e a
 * consulta inteira se perde em silêncio.
 *
 * Este guard lê os endereços citados no arquivo e exige que cada um case com uma rota
 * declarada em `src/routes.tsx`, com `<param>` e `:param` como coringa.
 */

const LLMS = readFileSync(join(process.cwd(), "public", "llms.txt"), "utf8");

/**
 * Endereços citados no arquivo, nas duas formas em que eles aparecem: URL completa no
 * host canônico e template entre crases (`/faq/<slug>`). Asset servido direto do
 * `dist` (sitemap, feed, openapi, `.well-known`) fica de fora: não é rota de React
 * Router, e cobri-lo aqui só geraria falso positivo.
 */
function enderecosCitados(): string[] {
  const brutos = [
    ...[...LLMS.matchAll(/https:\/\/movepark\.co(\/[^\s)`\]"']*)?/g)].map((m) => m[1] ?? "/"),
    ...[...LLMS.matchAll(/`(\/[^`\s]*)`/g)].map((m) => m[1]),
  ];

  const limpos = brutos
    .map((u) => u.split(/[?#]/)[0].replace(/[.,;:]+$/, ""))
    .map((u) => u.replace(/<([a-zA-Z]+)>/g, ":$1"))
    .map((u) => u.replace(/\/+$/, "") || "/")
    // `/v1` é a Public API, que mora em api.movepark.co e não em rota do site.
    .filter((u) => u !== "/v1" && !u.startsWith("/v1/"));

  return [...new Set(limpos)];
}

/** Último segmento com ponto é arquivo servido do `dist`, não rota de React Router. */
const ehAsset = (u: string) => u.split("/").pop()?.includes(".") || u.startsWith("/.well-known");

/**
 * Arquivo citado que NÃO mora em `public/`: quem o escreve, e a marca que prova isso.
 *
 * Arquivo gerado é o caso perigoso, porque o `llms.txt` promete um endereço que só passa
 * a existir depois do build. Se o passo que escreve some, o arquivo some junto e a
 * promessa vira 404 sem nenhum teste reclamar.
 *
 * A `marca` é escrita entrada por entrada, e não derivada do nome, por dois motivos:
 * procurar só o nome aceitaria a menção dele num comentário como se fosse a escrita, e o
 * índice de preços tem duas escritas com o mesmo nome de arquivo (o geral e o por
 * destino), que precisam se provar separadamente. O sitemap não tem string de escrita,
 * porque quem o emite é o plugin do vite.
 */
const GERADOS: Record<string, { arquivo: string; marca: string }> = {
  "/llms-full.txt": { arquivo: "scripts/generate-geo-artifacts.mjs", marca: '"llms-full.txt"' },
  "/blog/feed.xml": { arquivo: "scripts/generate-geo-artifacts.mjs", marca: '"feed.xml"' },
  "/precos.json": {
    arquivo: "scripts/generate-geo-artifacts.mjs",
    marca: 'path.join(DIST, "precos.json")',
  },
  "/estacionamentos/:destino/precos.json": {
    arquivo: "scripts/generate-geo-artifacts.mjs",
    marca: 'escreverNoDestino(dest, "precos.json"',
  },
  "/sitemap.xml": { arquivo: "vite.config.ts", marca: "vite-plugin-sitemap" },
};

/** Casa por segmento, com `:param` como coringa. Mesmo critério do inventário de rotas. */
function casa(rota: string, url: string): boolean {
  if (rota === "*") return false;
  const r = rota.split("/").filter(Boolean);
  const u = url.split("/").filter(Boolean);
  return r.length === u.length && r.every((seg, i) => seg.startsWith(":") || seg === u[i]);
}

describe("contrato do llms.txt", () => {
  const rotas = rotasDeclaradas();
  const citados = enderecosCitados();

  it("encontra os endereços citados no arquivo", () => {
    expect(citados.length).toBeGreaterThan(8);
  });

  it("todo endereço citado existe como rota", () => {
    const mortos = citados
      .filter((url) => !ehAsset(url))
      .filter((url) => !rotas.some((rota) => casa(rota, url)));
    expect(mortos, "endereço no llms.txt que nenhuma rota atende").toEqual([]);
  });

  it("todo arquivo citado está no repo ou é escrito por um passo do build", () => {
    const mortos = citados.filter((url) => {
      if (!ehAsset(url)) return false;
      if (existsSync(join(process.cwd(), "public", url.replace(/^\//, "")))) return false;
      const gerado = GERADOS[url];
      if (!gerado) return true;
      // Não basta estar na lista: o passo que escreve o arquivo tem que continuar lá.
      return !readFileSync(join(process.cwd(), gerado.arquivo), "utf8").includes(gerado.marca);
    });
    expect(mortos, "arquivo prometido no llms.txt que ninguém escreve").toEqual([]);
  });

  /**
   * As duas seções que Conteúdo 25 acrescentou. Elas são o que separa uma fonte
   * pensada para máquina de um site que só tem HTML, e some fácil numa reescrita.
   */
  it("declara como pedir Markdown, o que o preço significa e com que frequência muda", () => {
    expect(LLMS).toContain("## Dados legíveis por máquina");
    expect(LLMS).toContain("## Frequência de atualização");
    expect(LLMS).toContain("Accept: text/markdown");
    expect(LLMS).toContain("O preço publicado é o cobrado no fechamento");
    expect(LLMS).toMatch(/`search_blog`/);
    expect(LLMS).toMatch(/`get_blog_post`/);
    expect(LLMS).toContain("server-card.json");
  });

  /** Regra de marca: travessão é proibido em texto publicado (CLAUDE.md). */
  it("não usa travessão", () => {
    expect(LLMS).not.toMatch(/[—–]/);
  });
});
