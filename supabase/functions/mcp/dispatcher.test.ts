import { assertEquals } from "jsr:@std/assert";
import { handle, type Deps } from "./index.ts";

/**
 * O dispatcher HTTP, que até aqui não tinha teste nenhum.
 *
 * O que ele decide: qual superfície, se a credencial serve, qual tool é visível,
 * qual é chamável, qual é a cara do erro e o que vira linha de auditoria. Cada
 * uma dessas decisões era uma condicional que só existia dentro do `Deno.serve`,
 * confiando em ninguém errar ao ler o arquivo.
 *
 * As dependências entram por parâmetro, então nada aqui toca rede ou banco. A
 * tool nunca executa de verdade: o que se mede é se ela **seria** executada, e
 * com qual contexto.
 */

const CHAVE_PARCEIRO = "mp_live_parceiro_abcdefghijk";
const CHAVE_PLATAFORMA = "mp_live_plataforma_abcdefgh";
const CHAVE_REVOGADA = "mp_live_revogada_abcdefghijk";
const CHAVE_EXPIRADA = "mp_live_expirada_abcdefghijk";
const JWT_USUARIO =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1LTEifQ.assinatura";

type Chamada = { endpoint: string; nome: string; args: Record<string, unknown> };

function ambiente() {
  const chamadas: Chamada[] = [];
  const auditoria: Record<string, unknown>[] = [];
  let relogio = 1000;

  const deps: Deps = {
    verificar: (chave) => {
      switch (chave) {
        case CHAVE_PARCEIRO:
          return Promise.resolve({
            ok: true, api_key_id: "k-parceiro", company_id: "empresa-1",
            scopes: ["locations:read", "bookings:read"], environment: "live",
          });
        case CHAVE_PLATAFORMA:
          return Promise.resolve({
            ok: true, api_key_id: "k-plataforma", company_id: null,
            scopes: ["blog:write"], environment: "live",
          });
        case CHAVE_REVOGADA:
          return Promise.resolve({ ok: false, reason: "revoked" });
        case CHAVE_EXPIRADA:
          return Promise.resolve({ ok: false, reason: "expired" });
        default:
          return Promise.resolve({ ok: false, reason: "invalid_key" });
      }
    },
    chamarTool: ({ endpoint, nome, args }) => {
      chamadas.push({ endpoint, nome, args });
      return Promise.resolve({ ok: true });
    },
    auditar: (linha) => auditoria.push(linha as unknown as Record<string, unknown>),
    agora: () => (relogio += 5),
  };

  return { deps, chamadas, auditoria };
}

function pedido(
  caminho: string,
  corpo: unknown,
  cabecalhos: Record<string, string> = {},
): Request {
  return new Request(`https://mcp.movepark.co${caminho}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cabecalhos },
    body: JSON.stringify(corpo),
  });
}

const listar = { jsonrpc: "2.0", id: 1, method: "tools/list" };
const chamar = (nome: string, args: Record<string, unknown> = {}) => ({
  jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: nome, arguments: args },
});

async function corpo(r: Response) {
  return await r.json() as Record<string, never>;
}

// ── 1. O 401 é indistinguível ───────────────────────────────────────────────
// Se ele diferir por motivo, o endpoint vira serviço gratuito de triagem de
// chave vazada: quem achou uma descobre de graça se ela ainda vale.

Deno.test("401 é idêntico para ausente, inválida, revogada e expirada", async () => {
  const { deps } = ambiente();
  const respostas: string[] = [];
  const statuses: number[] = [];

  for (const auth of [null, "Bearer mp_live_naoexiste_xyzab",
                      `Bearer ${CHAVE_REVOGADA}`, `Bearer ${CHAVE_EXPIRADA}`]) {
    const r = await handle(
      pedido("/partner", listar, auth ? { Authorization: auth } : {}),
      deps,
    );
    statuses.push(r.status);
    respostas.push(JSON.stringify(await corpo(r)));
  }

  assertEquals(statuses, [401, 401, 401, 401]);
  // Byte a byte: uma resposta só, repetida quatro vezes.
  assertEquals(new Set(respostas).size, 1, `respostas diferentes: ${respostas.join(" | ")}`);
});

// ── 2. A trava de tipo de chave, agora medida ───────────────────────────────

Deno.test("chave de empresa não abre o Manager, e a da Movepark não abre o parceiro", async () => {
  const { deps, chamadas } = ambiente();

  const parceiroNoManager = await handle(
    pedido("/manager", chamar("upsert_blog_post", { slug: "x", title: "t", body_md: "b" }),
      { Authorization: `Bearer ${CHAVE_PARCEIRO}` }), deps);
  assertEquals(parceiroNoManager.status, 401);

  const plataformaNoParceiro = await handle(
    pedido("/partner", chamar("list_locations"),
      { Authorization: `Bearer ${CHAVE_PLATAFORMA}` }), deps);
  assertEquals(plataformaNoParceiro.status, 401);

  // Nenhuma tool chegou a ser executada nos dois casos.
  assertEquals(chamadas, []);
});

// ── 3. Escopo esconde e barra, e são a mesma regra ─────────────────────────

Deno.test("tool fora de escopo não aparece na lista nem executa", async () => {
  const { deps, chamadas } = ambiente();
  const cab = { Authorization: `Bearer ${CHAVE_PARCEIRO}` };

  const lista = await corpo(await handle(pedido("/partner", listar, cab), deps));
  const nomes = (lista as unknown as { result: { tools: { name: string }[] } }).result.tools
    .map((t) => t.name);
  assertEquals(nomes.includes("list_locations"), true, "locations:read está na chave");
  assertEquals(nomes.includes("create_booking"), false, "bookings:write não está");

  // Saber o nome não basta: o gate do call recheca o escopo.
  const r = await handle(pedido("/partner", chamar("create_booking"), cab), deps);
  const b = await corpo(r) as unknown as { error: { code: number; message: string } };
  assertEquals(b.error.code, -32602);
  // A mensagem não confirma que a tool existe: fora de escopo é indistinguível
  // de inexistente.
  const inexistente = await handle(pedido("/partner", chamar("tool_que_nao_existe"), cab), deps);
  const bi = await corpo(inexistente) as unknown as { error: { message: string } };
  assertEquals(
    b.error.message.replace("create_booking", "X"),
    bi.error.message.replace("tool_que_nao_existe", "X"),
  );
  assertEquals(chamadas, []);
});

Deno.test("tool do Manager não é chamável por nenhuma outra superfície", async () => {
  const { deps, chamadas } = ambiente();
  const alvos: Array<[string, Record<string, string>]> = [
    ["", {}],
    ["/customer", { Authorization: `Bearer ${JWT_USUARIO}` }],
    ["/partner", { Authorization: `Bearer ${CHAVE_PARCEIRO}` }],
  ];
  for (const [caminho, cab] of alvos) {
    const r = await handle(
      pedido(caminho, chamar("upsert_blog_post", { slug: "x", title: "t", body_md: "b" }), cab),
      deps,
    );
    const b = await corpo(r) as unknown as { error?: { code: number } };
    assertEquals(b.error?.code, -32602, `${caminho || "/"} não pode chamar tool de Manager`);
  }
  assertEquals(chamadas, []);
});

Deno.test("com a chave de plataforma, o Manager executa", async () => {
  const { deps, chamadas } = ambiente();
  const r = await handle(
    pedido("/manager", chamar("upsert_blog_post", { slug: "x", title: "t", body_md: "b" }),
      { Authorization: `Bearer ${CHAVE_PLATAFORMA}` }), deps);
  assertEquals(r.status, 200);
  assertEquals(chamadas.length, 1);
  assertEquals(chamadas[0].endpoint, "manager");
  assertEquals(chamadas[0].nome, "upsert_blog_post");
});

// ── 4. Obrigatório é conferido antes de executar ───────────────────────────

Deno.test("parâmetro obrigatório ausente barra antes da tool rodar", async () => {
  const { deps, chamadas } = ambiente();
  const r = await handle(
    pedido("/manager", chamar("upsert_blog_post", { slug: "x" }),
      { Authorization: `Bearer ${CHAVE_PLATAFORMA}` }), deps);
  const b = await corpo(r) as unknown as { error: { code: number; message: string } };
  assertEquals(b.error.code, -32602);
  assertEquals(b.error.message.includes("title"), true);
  assertEquals(chamadas, [], "nada pode ser escrito com payload incompleto");
});

// ── 5. initialize e ping seguem abertos ────────────────────────────────────
// É o que impede o endpoint de responder "essa chave vale?" de graça.

Deno.test("initialize responde igual com chave boa, ruim e ausente", async () => {
  const { deps } = ambiente();
  const corpos: string[] = [];
  for (const cab of [{}, { Authorization: `Bearer ${CHAVE_PARCEIRO}` },
                     { Authorization: `Bearer ${CHAVE_REVOGADA}` }]) {
    const r = await handle(
      pedido("/partner", { jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, cab), deps);
    assertEquals(r.status, 200);
    corpos.push(JSON.stringify(await corpo(r)));
  }
  assertEquals(new Set(corpos).size, 1, "initialize não pode revelar se a chave vale");
});

Deno.test("cada superfície se apresenta com o próprio nome", async () => {
  const { deps } = ambiente();
  const nomes: string[] = [];
  for (const caminho of ["", "/partner", "/customer", "/manager"]) {
    const r = await handle(
      pedido(caminho, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} }), deps);
    const b = await corpo(r) as unknown as { result: { serverInfo: { name: string } } };
    nomes.push(b.result.serverInfo.name);
  }
  assertEquals(nomes, ["movepark", "movepark-partner", "movepark-customer", "movepark-manager"]);
});

// ── 6. Superfície desconhecida ─────────────────────────────────────────────

Deno.test("path que não é superfície devolve 404, e não a superfície pública", async () => {
  const { deps } = ambiente();
  for (const caminho of ["/admin", "/partnerX", "/manager/extra"]) {
    const r = await handle(pedido(caminho, listar), deps);
    assertEquals(r.status, 404, caminho);
  }
});

// ── 7. Auditoria ───────────────────────────────────────────────────────────

Deno.test("tentativa com credencial recusada deixa rastro", async () => {
  const { deps, auditoria } = ambiente();
  await handle(pedido("/partner", listar, { Authorization: `Bearer ${CHAVE_REVOGADA}` }), deps);

  assertEquals(auditoria.length, 1);
  assertEquals(auditoria[0].status, 401);
  assertEquals(auditoria[0].api_key_id, null, "chave recusada não tem id a que atribuir");
  // O motivo distingue no log o que a resposta não distingue para o cliente.
  assertEquals(auditoria[0].path, "chave_revoked");
});

Deno.test("revogada e expirada se distinguem no log, e não na resposta", async () => {
  const { deps, auditoria } = ambiente();
  await handle(pedido("/partner", listar, { Authorization: `Bearer ${CHAVE_REVOGADA}` }), deps);
  await handle(pedido("/partner", listar, { Authorization: `Bearer ${CHAVE_EXPIRADA}` }), deps);
  assertEquals(auditoria.map((l) => l.path), ["chave_revoked", "chave_expired"]);
});

Deno.test("chamada anônima do consumidor não vira linha de log", async () => {
  // É o caso de maior volume do servidor, e ela não apresentou credencial. Logar
  // trocaria uma pergunta de segurança por um custo de escrita em toda leitura.
  const { deps, auditoria } = ambiente();
  await handle(pedido("", listar), deps);
  await handle(pedido("", chamar("current_datetime")), deps);
  assertEquals(auditoria, []);
});

Deno.test("chamada autenticada registra tool, escopo e latência", async () => {
  const { deps, auditoria } = ambiente();
  await handle(pedido("/partner", chamar("list_locations"),
    { Authorization: `Bearer ${CHAVE_PARCEIRO}`, "x-request-id": "req-42" }), deps);

  assertEquals(auditoria.length, 1);
  const l = auditoria[0];
  assertEquals(l.api_key_id, "k-parceiro");
  assertEquals(l.company_id, "empresa-1");
  assertEquals(l.surface, "mcp");
  assertEquals(l.path, "list_locations");
  assertEquals(l.scope, "locations:read");
  assertEquals(l.status, 200);
  assertEquals(l.request_id, "req-42");
  assertEquals(typeof l.latency_ms, "number");
});

Deno.test("chave da Movepark audita com empresa nula", async () => {
  const { deps, auditoria } = ambiente();
  await handle(pedido("/manager", listar, { Authorization: `Bearer ${CHAVE_PLATAFORMA}` }), deps);
  assertEquals(auditoria[0].api_key_id, "k-plataforma");
  assertEquals(auditoria[0].company_id, null);
});

// ── 8. Formato do protocolo ────────────────────────────────────────────────

Deno.test("JSON inválido e requisição fora do JSON-RPC devolvem 400", async () => {
  const { deps } = ambiente();
  const cru = new Request("https://mcp.movepark.co/", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{nao e json",
  });
  assertEquals((await handle(cru, deps)).status, 400);

  const foraDoProtocolo = await handle(pedido("", { qualquer: "coisa" }), deps);
  assertEquals(foraDoProtocolo.status, 400);
});

Deno.test("método desconhecido responde -32601 sem executar nada", async () => {
  const { deps, chamadas } = ambiente();
  const r = await handle(pedido("", { jsonrpc: "2.0", id: 1, method: "resources/list" }), deps);
  const b = await corpo(r) as unknown as { error: { code: number } };
  assertEquals(b.error.code, -32601);
  assertEquals(chamadas, []);
});

Deno.test("erro dentro da tool vira isError, e não erro de protocolo", async () => {
  // A convenção do MCP: falha de execução é resultado, e o cliente continua a
  // conversa. Erro de protocolo derruba a sessão.
  const { deps, chamadas } = ambiente();
  deps.chamarTool = () => Promise.reject(new Error("o banco recusou"));
  const r = await handle(pedido("", chamar("current_datetime")), deps);
  assertEquals(r.status, 200);
  const b = await corpo(r) as unknown as { result: { isError: boolean } };
  assertEquals(b.result.isError, true);
  assertEquals(chamadas, []);
});

// ── 9. Ambiguidade de credencial ───────────────────────────────────────────

Deno.test("chave nos dois headers devolve 400 dizendo qual usar", async () => {
  const { deps } = ambiente();
  const r = await handle(pedido("/partner", listar, {
    Authorization: `Bearer ${CHAVE_PARCEIRO}`, "X-API-Key": CHAVE_PLATAFORMA,
  }), deps);
  assertEquals(r.status, 400);
  const b = await corpo(r) as unknown as { error: { message: string } };
  assertEquals(b.error.message.includes("X-API-Key"), true);
});

// ── 10. CORS e método ──────────────────────────────────────────────────────

Deno.test("preflight não exige credencial e libera os headers do MCP", async () => {
  const { deps } = ambiente();
  const r = await handle(
    new Request("https://mcp.movepark.co/manager", { method: "OPTIONS" }), deps);
  assertEquals(r.status, 200);
  const permitidos = r.headers.get("Access-Control-Allow-Headers") ?? "";
  for (const h of ["authorization", "x-api-key", "content-type"]) {
    assertEquals(permitidos.toLowerCase().includes(h), true, h);
  }
});
