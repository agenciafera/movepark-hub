import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  SITEMAP_DYNAMIC_PATTERNS,
  SITEMAP_OPT_OUT,
  SITEMAP_PRIVATE_PREFIXES,
  SITEMAP_STATIC_ROUTES,
} from "@/lib/sitemapRoutes";

/**
 * O bug que este arquivo trava: em 13/08/2026 o sitemap publicado tinha 135 URLs e nenhuma
 * página institucional, porque a lista do `vite.config.ts` era escrita à mão e ninguém
 * lembrou de acrescentar `/sobre`, `/faq`, `/como-funciona`, `/ajuda`, `/contato`,
 * `/cancelamento` e `/seja-parceiro` quando essas rotas nasceram.
 *
 * A lista continua à mão, porque o `vite.config.ts` não consegue importar a árvore de rotas
 * (ele é empacotado por esbuild antes de o alias `@` existir). O que muda é que agora
 * esquecer custa CI vermelho: toda rota nova precisa de decisão explícita, entrar no sitemap
 * ou entrar na lista de opt-out com motivo escrito.
 *
 * Lê o `routes.tsx` como texto de propósito. Importar a árvore puxaria as ~90 páginas para
 * dentro do happy-dom só para contar caminhos.
 */
function rotasDeclaradas(): string[] {
  const fonte = fs.readFileSync(path.resolve(__dirname, "../routes.tsx"), "utf-8");
  return [...fonte.matchAll(/path:\s*"([^"]*)"/g)].map((m) => m[1]);
}

const conhecidas = new Set<string>([
  ...SITEMAP_STATIC_ROUTES,
  ...Object.keys(SITEMAP_OPT_OUT),
  ...SITEMAP_DYNAMIC_PATTERNS,
]);

const ehPrivada = (r: string) =>
  SITEMAP_PRIVATE_PREFIXES.some((p) => r === p || r.startsWith(`${p}/`));

describe("cobertura do sitemap", () => {
  it("acha as rotas no routes.tsx", () => {
    const rotas = rotasDeclaradas();
    expect(rotas.length).toBeGreaterThan(50);
    expect(rotas).toContain("/sobre");
  });

  it("toda rota absoluta tem decisão: sitemap, opt-out declarado ou área logada", () => {
    const semDecisao = rotasDeclaradas()
      .filter((r) => r.startsWith("/") || r === "*")
      .filter((r) => !conhecidas.has(r) && !ehPrivada(r));

    expect(
      semDecisao,
      `Rota nova sem decisão de sitemap: ${semDecisao.join(", ")}. ` +
        "Acrescente em SITEMAP_STATIC_ROUTES (se for indexável) ou em SITEMAP_OPT_OUT com o motivo.",
    ).toEqual([]);
  });

  it("as institucionais que faltavam estão no sitemap", () => {
    // A lista exata medida como ausente no sitemap publicado de 13/08/2026.
    for (const rota of [
      "/sobre",
      "/faq",
      "/como-funciona",
      "/ajuda",
      "/contato",
      "/cancelamento",
      "/termos",
      "/privacidade",
      "/seja-parceiro",
    ]) {
      expect(SITEMAP_STATIC_ROUTES).toContain(rota);
      expect(rotasDeclaradas()).toContain(rota);
    }
  });

  it("nenhuma rota do sitemap é de área logada nem tem opt-out", () => {
    for (const rota of SITEMAP_STATIC_ROUTES) {
      expect(ehPrivada(rota), `${rota} está sob prefixo privado`).toBe(false);
      expect(SITEMAP_OPT_OUT[rota], `${rota} está no sitemap e no opt-out`).toBeUndefined();
    }
  });

  it("todo opt-out tem motivo escrito", () => {
    for (const [rota, motivo] of Object.entries(SITEMAP_OPT_OUT)) {
      expect(motivo.length, `${rota} sem motivo`).toBeGreaterThan(10);
    }
  });

  it("os nomes reais das páginas legais são /termos e /privacidade", () => {
    // O WordPress publica /termos-de-uso/ e /politica-de-privacidade/. No Hub as rotas têm
    // outro nome, então a migração precisa de 301 e não de cópia de URL. Se alguém renomear
    // as rotas, este teste avisa antes de o redirect apontar para o vazio.
    const rotas = rotasDeclaradas();
    expect(rotas).toContain("/termos");
    expect(rotas).toContain("/privacidade");
    expect(rotas).not.toContain("/termos-de-uso");
    expect(rotas).not.toContain("/politica-de-privacidade");
  });
});
