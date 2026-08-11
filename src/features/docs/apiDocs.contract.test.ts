import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MCP_PARTNER_TOOLS, MCP_PUBLIC_TOOLS } from "./apiDocs";

/**
 * A página pública `/docs` republica o catálogo de tools, e por isso ela drifta.
 *
 * Estava com 8 tools públicas contra 12 reais: faltavam `search_knowledge`,
 * `current_datetime`, `search_blog` e `get_blog_post`. Nada apontava, porque o
 * `lint:openapi` confere registro contra card, e esta página não é card.
 *
 * A lista fica, e não vira link: quem chega em `/docs` está avaliando a API e se
 * beneficia de ver as tools na página. O que muda é que agora ela é conferida.
 */

const compartilhado = readFileSync(
  join(process.cwd(), "supabase", "functions", "_shared", "assistant-tools.ts"),
  "utf8",
);
const toolsMcp = readFileSync(
  join(process.cwd(), "supabase", "functions", "mcp", "tools.ts"),
  "utf8",
);

/** Nomes de `READ_TOOLS`, na ordem em que o registro os declara. */
const nomesPublicos = (() => {
  const corpo = compartilhado.slice(compartilhado.indexOf("export const READ_TOOLS"));
  return [...corpo.matchAll(/name:\s*"([a-z_]+)"/g)].map((m) => m[1]);
})();

const partnerBloco = toolsMcp.slice(
  toolsMcp.indexOf("export const PARTNER_TOOLS"),
  toolsMcp.indexOf("export const CUSTOMER_TOOLS"),
);
const nomesParceiro = new Set(
  [...partnerBloco.matchAll(/name:\s*"([a-z_]+)"/g)].map((m) => m[1]),
);
const escoposParceiro = new Set(
  [...partnerBloco.matchAll(/scope:\s*"([a-z:-]+)"/g)].map((m) => m[1]),
);

describe("/docs não pode divergir do registro de tools", () => {
  it("lê registros não vazios", () => {
    expect(nomesPublicos.length).toBeGreaterThan(5);
    expect(nomesParceiro.size).toBeGreaterThan(20);
  });

  it("as tools públicas listadas são exatamente as do registro compartilhado", () => {
    // Exatamente, e não "contém": tool que sai do registro precisa sair daqui
    // também, senão a página anuncia o que o servidor não serve.
    expect([...MCP_PUBLIC_TOOLS].sort()).toEqual([...nomesPublicos].sort());
  });

  it("toda tool de parceiro citada existe de verdade", () => {
    // A página agrupa nomes ("list_locations / get_location") para caber na
    // tabela, então a comparação é por nome individual.
    const citados = MCP_PARTNER_TOOLS.flatMap((t) => t.name.split("/").map((n) => n.trim()));
    expect(citados.filter((n) => !nomesParceiro.has(n))).toEqual([]);
  });

  it("todo escopo citado existe no registro de parceiro", () => {
    // A página usa curinga (`coupons:*`) para resumir um grupo de escopos numa
    // linha da tabela. Vale, desde que o recurso exista: um prefixo errado
    // continua reprovando, que é o ponto.
    const orfaos = MCP_PARTNER_TOOLS.map((t) => t.scope).filter((e) => {
      if (escoposParceiro.has(e)) return false;
      if (!e.endsWith(":*")) return true;
      const recurso = e.slice(0, -1);
      return ![...escoposParceiro].some((real) => real.startsWith(recurso));
    });
    expect(orfaos).toEqual([]);
  });

  it("a página não anuncia a superfície interna", () => {
    const pagina = readFileSync(join(process.cwd(), "src", "routes", "docs.tsx"), "utf8");
    expect(pagina.includes("/manager")).toBe(false);
    expect(pagina.includes("manager-card")).toBe(false);
    // Nem por tool: as três de escrita do blog são de Manager.
    for (const t of ["upsert_blog_post", "publish_blog_post", "delete_blog_post"]) {
      expect(pagina.includes(t)).toBe(false);
    }
  });
});
