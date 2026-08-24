import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MCP_MANAGER_ENDPOINT, ROTAS_INTERNAS, SUPERFICIES_MCP } from "./catalog";

/**
 * O catálogo interno não pode divergir do gateway.
 *
 * O `lint:openapi` protege a superfície pública: rota pública sem OpenAPI reprova,
 * e rota interna DENTRO do OpenAPI também. Sobrava o outro lado, que é rota
 * interna sem documentação em lugar nenhum. Esta página é a documentação dela, e
 * este teste é o que a mantém honesta.
 */

const router = readFileSync(
  join(process.cwd(), "supabase", "functions", "api", "router.ts"),
  "utf8",
);

const noRouter = new Set(
  [...router.matchAll(/\binternalRoute\(\s*"([A-Z]+)",\s*"([^"]+)"/g)].map(
    (m) => `${m[1]} ${m[2]}`,
  ),
);
const noCatalogo = new Set(ROTAS_INTERNAS.map((r) => `${r.metodo} ${r.caminho}`));

describe("catálogo interno do Manager", () => {
  it("lê um router não vazio (senão o teste passaria sobre lista vazia)", () => {
    expect(noRouter.size).toBeGreaterThan(0);
  });

  it("toda rota interna do gateway está documentada aqui", () => {
    expect([...noRouter].filter((r) => !noCatalogo.has(r))).toEqual([]);
  });

  it("nada no catálogo aponta para rota que não existe", () => {
    expect([...noCatalogo].filter((r) => !noRouter.has(r))).toEqual([]);
  });

  it("toda rota interna declara escopo de plataforma", () => {
    // Escopo de empresa numa rota interna significaria que um parceiro alcança
    // ação de Manager. É a checagem que faltava quando blog:write foi criado.
    const plataforma = new Set(["blog:write", "checkout:link", "fares:write"]);
    const fora = ROTAS_INTERNAS.filter((r) => !plataforma.has(r.escopo));
    expect(fora.map((r) => `${r.caminho} usa ${r.escopo}`)).toEqual([]);
  });

  it("cada rota explica o que responde", () => {
    expect(ROTAS_INTERNAS.filter((r) => !r.resumo || !r.respostas).map((r) => r.caminho)).toEqual([]);
  });
});

describe("superfície de MCP do Manager", () => {
  const tools = readFileSync(
    join(process.cwd(), "supabase", "functions", "mcp", "tools.ts"),
    "utf8",
  );
  const bloco = tools.slice(tools.indexOf("export const MANAGER_TOOLS"));
  const nomes = [...bloco.matchAll(/name:\s*"([a-z_]+)"/g)].map((m) => m[1]);

  it("lê um registro não vazio", () => {
    expect(nomes.length).toBeGreaterThan(0);
  });

  it("as operações do blog existem nas duas superfícies", () => {
    // Uma regra, duas superfícies (`_shared/blog-write.ts`). Se um lado ganhar
    // uma operação e o outro não, quem usa MCP e quem usa REST veem produtos
    // diferentes, e a página aqui descreve só um deles.
    //
    // A comparação é do BLOCO DO BLOG, não do Manager inteiro: a superfície interna
    // também hospeda leitura sem contraparte REST (`get_wl_mapping`, para o agente de
    // WhatsApp). Comparar tudo transformaria a invariante num inventário, que quebra
    // toda vez que a superfície cresce sem nada ter divergido.
    const operacoes = ROTAS_INTERNAS.map((r) =>
      r.caminho.endsWith("/publish")
        ? "publish_blog_post"
        : r.caminho.endsWith("/delete")
          ? "delete_blog_post"
          : "upsert_blog_post",
    );
    const doBlog = nomes.filter((n) => n.endsWith("_blog_post"));
    expect([...doBlog].sort()).toEqual([...operacoes].sort());
  });

  it("toda tool do Manager exige escopo de plataforma", () => {
    // A regra é "declara escopo de plataforma", e não "é blog:write". Escopo de
    // empresa aqui significaria que um parceiro alcança ação de Manager.
    const plataforma = ["blog:write", "wl:read"];
    const semEscopo = nomes.filter(
      (n) =>
        !plataforma.some((escopo) =>
          new RegExp(`name: "${n}"[\\s\\S]{0,220}?scope: "${escopo}"`).test(bloco),
        ),
    );
    expect(semEscopo).toEqual([]);
  });

  it("a tool do white-label está na página, e não só no código", () => {
    // ADR-003: capacidade que existe e não está documentada é capacidade que ninguém
    // descobre. Esta superfície não tem card, então a página é a única documentação.
    const manager = SUPERFICIES_MCP.find((s) => s.modalidade === "manager");
    expect(manager?.tools).toMatch(/white-label/i);
  });

  it("a superfície interna aparece na tabela, e sem card", () => {
    const manager = SUPERFICIES_MCP.find((s) => s.modalidade === "manager");
    expect(manager?.endpoint).toBe(MCP_MANAGER_ENDPOINT);
    // O card é o que anuncia a superfície para fora: esta não pode ter um.
    expect(existsSync(join(process.cwd(), "public", ".well-known", "mcp", "manager-card.json"))).toBe(
      false,
    );
  });
});
