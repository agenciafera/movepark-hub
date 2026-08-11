import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROTAS_INTERNAS } from "./catalog";

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
