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

  it("admite por escrito que o freio não é a defesa real", () => {
    // O limite vale por localidade da Cloudflare, então atacante distribuído não
    // é barrado aqui. Isso é aceito de propósito, porque quem segura é o
    // `otp_request_allowed`, no banco. O comentário é parte do contrato: sem ele
    // alguém confia na borda.
    expect(worker.includes("otp_request_allowed")).toBe(true);
    expect(/POR LOCALIDADE/.test(worker)).toBe(true);
  });

  it("conta no binding nativo, e não num contador escrito sobre KV", () => {
    // Contador sobre KV cobra uma escrita por requisição freada. O plano grátis
    // dá 1.000 por dia na conta inteira, e um flood de OTP queimou a cota em
    // três minutos (12/08/2026). O binding nativo não escreve nada.
    expect(/limiter\.limit\(\{\s*key:/.test(worker)).toBe(true);
    expect(worker.includes("KVNamespace")).toBe(false);
    expect(worker.includes("expirationTtl")).toBe(false);
  });

  it("falha aberto quando o freio quebra", () => {
    // Este é o defeito que derrubou a Public API: o erro de cota do KV subia sem
    // tratamento e virava 500 em toda chamada autenticada. Um freio de
    // conveniência não pode ser o motivo de a API parar.
    const fn = worker.slice(worker.indexOf("async function rateLimited"));
    expect(/catch\s*\{\s*return false;/.test(fn.slice(0, 400))).toBe(true);
  });
});

describe("configuração do worker de API", () => {
  const cfg = readFileSync(join(process.cwd(), "wrangler.api.jsonc"), "utf8");

  it("declara o binding de rate limit que o código consome", () => {
    // Código e config são um contrato só: sem o binding, `env.API_RATELIMIT` é
    // undefined e o freio some silenciosamente.
    expect(/"ratelimits"/.test(cfg)).toBe(true);
    expect(/"name":\s*"API_RATELIMIT"/.test(cfg)).toBe(true);
    expect(worker.includes("env.API_RATELIMIT")).toBe(true);
  });

  it("não volta a pendurar o freio no KV", () => {
    expect(cfg.includes("kv_namespaces")).toBe(false);
  });

  it("usa uma janela que o binding aceita", () => {
    // A Cloudflare só admite `period` 10 ou 60. Qualquer outro valor falha no
    // deploy, não em runtime, então o erro aparece longe de quem editou.
    const periodo = /"period":\s*(\d+)/.exec(cfg)?.[1];
    expect(["10", "60"]).toContain(periodo);
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

describe("página de documentação do MCP", () => {
  const pagina = worker.slice(worker.indexOf("function mcpDocsHtml"));

  /** Nomes de tool declarados nos registros da Edge. */
  const nomesDeTool = (() => {
    const tools = readFileSync(
      join(process.cwd(), "supabase", "functions", "mcp", "tools.ts"),
      "utf8",
    );
    const compartilhado = readFileSync(
      join(process.cwd(), "supabase", "functions", "_shared", "assistant-tools.ts"),
      "utf8",
    );
    const cliente = readFileSync(
      join(process.cwd(), "supabase", "functions", "mcp", "customer.logic.ts"),
      "utf8",
    );
    const nomes = new Set<string>();
    for (const src of [tools, compartilhado, cliente]) {
      for (const m of src.matchAll(/name:\s*"([a-z_]+)"/g)) nomes.add(m[1]);
    }
    return nomes;
  })();

  /**
   * Citar tool em prosa ou num exemplo é diferente de republicar o catálogo.
   * Cada nome aqui tem uma razão, e a lista só encolhe.
   */
  const CITAVEIS = new Map([
    ["request_login_otp", "passo zero do login, antes de existir card"],
    ["verify_login_otp", "passo dois do login"],
    ["list_bookings", "exemplo de curl com chave de parceiro"],
  ]);

  it("lê um catálogo de tools não vazio", () => {
    expect(nomesDeTool.size).toBeGreaterThan(30);
  });

  it("não republica o catálogo de tools", () => {
    // Ela listava 26 linhas escritas à mão, em três tabelas, sem guard nenhum. E
    // mentia: dizia "três superfícies" depois que virou quatro, e não citava a
    // `search_knowledge` que o teste de integração exige existir. Quem descreve
    // tools são os cards, que o `lint:openapi` já confere nas duas direções.
    const citadas = [...nomesDeTool].filter((n) => pagina.includes(n) && !CITAVEIS.has(n));
    expect(citadas).toEqual([]);

    // E o formato que envelhece é a tabela: linha de tool com descrição ao lado.
    // Nome solto em prosa ou em curl não drifta; tabela drifta.
    const linhasDeTabela = [...pagina.matchAll(/<td><code>([a-z_]+)<\/code><\/td>/g)]
      .map((m) => m[1])
      .filter((n) => nomesDeTool.has(n));
    expect(linhasDeTabela).toEqual([]);
  });

  it("aponta para os três cards, que são a fonte", () => {
    for (const card of ["server-card.json", "partner-card.json", "customer-card.json"]) {
      expect(pagina).toContain(card);
    }
  });

  it("não anuncia a superfície interna", () => {
    // Manager não tem card e não entra em documento público. O `lint:openapi`
    // guarda os cards; esta página precisa da mesma regra.
    expect(pagina.includes("/manager")).toBe(false);
    expect(pagina.includes("manager-card")).toBe(false);
  });

  it("explica a URL única, que é o que os cards não dizem", () => {
    expect(pagina).toContain("Uma URL");
    // A contagem de superfícies não aparece em número: era ela que envelhecia.
    expect(/(Três|Duas|Quatro) superfícies/.test(pagina)).toBe(false);
  });
});
