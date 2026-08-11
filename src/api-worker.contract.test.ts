import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * O worker de borda do `mcp.movepark.co` e do `api.movepark.co`.
 *
 * Ele não tinha teste nenhum: roteamento por hostname, allowlist de superfície,
 * freio de custo e CORS viviam só na leitura do arquivo. A cobertura viva era um
 * teste de integração contra o domínio publicado, que só roda em `test:int` e
 * portanto não é gate.
 *
 * Estes testes são de FONTE, e não de execução. O worker importa tipos do
 * Cloudflare e depende de bindings (KV, env), então instanciá-lo aqui custaria um
 * dublê grande para provar pouco. O que interessa é o inverso: que certas
 * decisões continuem escritas onde estão, porque cada uma delas foi um defeito.
 */

const worker = readFileSync(join(process.cwd(), "src", "api-worker.ts"), "utf8");

/** Corpo de um `const NOME = new Set([...])`. */
function conjunto(nome: string): string[] {
  const m = new RegExp(`const ${nome} = new Set\\(\\[([^\\]]*)\\]`).exec(worker);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

describe("allowlist de superfície do MCP", () => {
  it("declara exatamente as superfícies que a Edge conhece", () => {
    // Antes disto o worker era passthrough cego: qualquer path virava
    // `/mcp<path>`. Com a raiz resolvendo perfil pela credencial, path inventado
    // não pode nem chegar na Edge.
    expect(conjunto("SUPERFICIES_MCP").sort()).toEqual(
      ["/", "/customer", "/manager", "/partner", "/public"].sort(),
    );
  });

  it("bate com o que o resolvedor da Edge aceita", () => {
    // Se as duas listas divergirem, ou o worker barra superfície que existe, ou
    // deixa passar path que a Edge trata como desconhecido. Os dois são bug.
    const resolvedor = readFileSync(
      join(process.cwd(), "supabase", "functions", "mcp", "resolver.ts"),
      "utf8",
    );
    for (const rota of conjunto("SUPERFICIES_MCP")) {
      if (rota === "/") continue; // a raiz aparece como `p === ""` no resolvedor
      expect(resolvedor.includes(`p === "${rota}"`)).toBe(true);
    }
  });

  it("responde 404 ao que está fora da lista, em vez de repassar", () => {
    expect(worker.includes("Superfície desconhecida.")).toBe(true);
    expect(/SUPERFICIES_MCP\.has\(rota\)/.test(worker)).toBe(true);
  });
});

describe("freio de custo na borda", () => {
  it("freia por nome de tool, e não por path", () => {
    // Por path, o freio valia só no `/customer` e deixava de valer no dia em que
    // a mesma tool fosse chamada pela raiz. O que custa dinheiro é a tool.
    expect(conjunto("TOOLS_FREADAS")).toContain("request_login_otp");
    expect(worker.includes('url.pathname.includes("/customer")')).toBe(false);
  });

  it("lê o nome da tool do corpo sem consumir a requisição", () => {
    // `request.clone()` antes de ler: sem isso o corpo chega vazio no upstream e
    // toda chamada de tool quebra.
    expect(/request\.clone\(\)\.text\(\)/.test(worker)).toBe(true);
  });

  it("só considera tools/call, e engole JSON inválido", () => {
    expect(worker.includes('d.method === "tools/call"')).toBe(true);
    // Corpo malformado não pode derrubar a borda: ele segue e a Edge responde o
    // erro de protocolo.
    expect(/catch\s*\{\s*return "";/.test(worker)).toBe(true);
  });

  it("admite por escrito que o contador não é atômico", () => {
    // O KV é eventualmente consistente e o get/put não é transacional: o freio
    // de borda não segura atacante distribuído. Isso é aceito de propósito,
    // porque a defesa real é `otp_request_allowed`, no banco. O comentário é
    // parte do contrato: sem ele alguém confia na borda.
    expect(worker.includes("otp_request_allowed")).toBe(true);
    expect(/não é atômico/.test(worker)).toBe(true);
  });
});

describe("CORS", () => {
  it("libera os headers que as duas credenciais usam", () => {
    // `Authorization` é o sujeito e `X-API-Key` é o agente. Faltar um dos dois
    // no preflight quebra o cliente MCP no navegador, e o erro aparece longe
    // daqui.
    for (const h of ["authorization", "x-api-key", "content-type", "mcp-session-id"]) {
      expect(worker.toLowerCase()).toContain(h);
    }
  });
});
