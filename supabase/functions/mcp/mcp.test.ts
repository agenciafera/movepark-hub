import { assertEquals } from "jsr:@std/assert";
import {
  initializeResult,
  isJsonRpcRequest,
  isNotification,
  JSONRPC,
  MCP_PROTOCOL_VERSION,
  rpcError,
  rpcResult,
  safeToolError,
  toolTextContent,
} from "./protocol.ts";
import { CUSTOMER_TOOLS, findTool, isToolCallable, listTools, MANAGER_TOOLS, missingRequired, PARTNER_TOOLS, PUBLIC_TOOLS } from "./tools.ts";
import { extractApiKey, hasScope, keyPrefix, sha256Hex } from "./auth.ts";

// ── protocolo ────────────────────────────────────────────────────────────────
Deno.test("rpcResult/rpcError seguem JSON-RPC 2.0", () => {
  assertEquals(rpcResult(1, { ok: true }), { jsonrpc: "2.0", id: 1, result: { ok: true } });
  assertEquals(rpcError(2, JSONRPC.METHOD_NOT_FOUND, "x"), {
    jsonrpc: "2.0",
    id: 2,
    error: { code: -32601, message: "x" },
  });
  assertEquals(rpcResult(undefined as never, {}).id, null);
});

Deno.test("initialize ecoa a versão do cliente e expõe capability tools", () => {
  const r = initializeResult("movepark", "2025-03-26");
  assertEquals(r.protocolVersion, "2025-03-26");
  assertEquals(r.capabilities.tools.listChanged, false);
  assertEquals(r.serverInfo.name, "movepark");
  assertEquals(initializeResult("x").protocolVersion, MCP_PROTOCOL_VERSION);
});

// Segurança: o MCP não pode vazar a mensagem crua do Postgres (nome de constraint/coluna/schema)
// ao parceiro. Só a nossa mensagem de negócio (P0001 ou throw sem SQLSTATE) é propagada.
Deno.test("safeToolError não vaza mensagem crua do Postgres", () => {
  // nosso throw (sem code) → mostra a mensagem
  assertEquals(safeToolError(new Error("Destino não encontrado.")), "Destino não encontrado.");
  // P0001 (RAISE de negócio) → mostra a mensagem
  assertEquals(safeToolError({ code: "P0001", message: "Reserva não encontrada nesta empresa." }), "Reserva não encontrada nesta empresa.");
  // unique/uuid inválido/constraint → genérico, sem vazar
  const leak = 'duplicate key value violates unique constraint "coupon_company_id_code_key"';
  assertEquals(safeToolError({ code: "23505", message: leak }).includes("constraint"), false);
  assertEquals(safeToolError({ code: "22P02", message: 'invalid input syntax for type uuid: "x"' }).includes("uuid"), false);
  assertEquals(safeToolError({ code: "XX000", message: "internal detail" }), "Erro ao executar a operação.");
});

Deno.test("safeToolError mascara internals do Postgres que chegam SEM code", () => {
  // O buraco fechado em 12/08/2026: o supabase-js re-lança o erro como
  // `new Error(error.message)`, perdendo o SQLSTATE. Antes, o caminho "sem code"
  // devolvia essa mensagem crua, vazando tabela, coluna e policy. Agora ela passa
  // pelo filtro de frases internas.
  const genérico = "Erro ao executar a operação.";
  const vazamentos = [
    'new row violates row-level security policy for table "booking"',
    "permission denied for table booking",
    'duplicate key value violates unique constraint "api_key_key_prefix_key"',
    'relation "public.payout_recipient" does not exist',
    'column "customer_tax_id" does not exist',
    'null value in column "profile_id" violates not-null constraint',
    "JWT expired",
  ];
  for (const v of vazamentos) {
    // Sem code, exatamente como o re-throw do supabase-js entrega.
    assertEquals(safeToolError(new Error(v)), genérico, `deveria mascarar: ${v}`);
  }
});

Deno.test("safeToolError NÃO mascara mensagem de app que cita um valor entre aspas", () => {
  // A armadilha ao endurecer: nossas mensagens às vezes citam um slug/valor entre
  // aspas (`Post "guarulhos" não encontrado`). Uma heurística de aspas mataria
  // isso; por isso o filtro é por frase interna INGLESA, que o português nunca tem.
  const nossas = [
    'Post "guarulhos" não encontrado. Use search_blog para achar o slug.',
    "Reserva não encontrada.",
    "CPF ou CNPJ inválido. Confirme os números e envie de novo.",
    "Faça login primeiro (request_login_otp e verify_login_otp).",
    'Categoria "precos" não existe.',
  ];
  for (const m of nossas) {
    assertEquals(safeToolError(new Error(m)), m, `deveria passar: ${m}`);
  }
});

Deno.test("toolTextContent embrulha JSON como text content", () => {
  const r = toolTextContent({ a: 1 });
  assertEquals(r.content[0].type, "text");
  assertEquals(r.content[0].text, '{"a":1}');
  assertEquals(r.isError, false);
  assertEquals(toolTextContent("oops", true).isError, true);
});

Deno.test("isJsonRpcRequest / isNotification", () => {
  assertEquals(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping" }), true);
  assertEquals(isJsonRpcRequest({ method: "ping" }), false);
  assertEquals(isNotification({ jsonrpc: "2.0", method: "notifications/initialized" }), true);
  assertEquals(isNotification({ jsonrpc: "2.0", id: 1, method: "tools/list" }), false);
});

// ── tools ────────────────────────────────────────────────────────────────────
Deno.test("listTools público devolve todas as tools de descoberta", () => {
  const t = listTools("public");
  assertEquals(t.length, PUBLIC_TOOLS.length);
  assertEquals(
    t.map((x) => x.name).includes("simulate_price"),
    true,
  );
  // shape MCP: sem `scope`
  assertEquals("scope" in t[0], false);
});

Deno.test("listTools parceiro filtra pelos escopos da chave", () => {
  const scoped = listTools("partner", ["bookings:read", "pricing:read"]);
  const names = scoped.map((x) => x.name);
  assertEquals(names.includes("list_bookings"), true);
  assertEquals(names.includes("simulate_price"), true);
  assertEquals(names.includes("create_booking"), false); // bookings:write ausente
  assertEquals(names.includes("list_locations"), false); // locations:read ausente
  // sem escopos → nenhuma tool
  assertEquals(listTools("partner", []).length, 0);
});

Deno.test("pricing:write expõe as tools de precificação (E1.4.1/2)", () => {
  const names = listTools("partner", ["pricing:write"]).map((x) => x.name);
  assertEquals(names.includes("update_pricing_rule"), true);
  assertEquals(names.includes("set_date_blocked"), true);
  assertEquals(findTool("partner", "update_pricing_rule")?.scope, "pricing:write");
  // sem o escopo, não aparecem
  assertEquals(listTools("partner", ["pricing:read"]).map((x) => x.name).includes("update_pricing_rule"), false);
});

Deno.test("findTool resolve por endpoint", () => {
  assertEquals(findTool("public", "get_faq")?.name, "get_faq");
  assertEquals(findTool("partner", "create_booking")?.scope, "bookings:write");
  assertEquals(findTool("partner", "get_faq"), null);
});

// search_knowledge (E3.3, RAG): tool de leitura, aparece no public e no customer (deriva de
// READ_TOOLS), nunca no partner, e é chamável sem escopo.
Deno.test("search_knowledge é tool de leitura em public e customer", () => {
  assertEquals(findTool("public", "search_knowledge")?.name, "search_knowledge");
  assertEquals(findTool("customer", "search_knowledge")?.name, "search_knowledge");
  assertEquals(findTool("partner", "search_knowledge"), null);
  assertEquals(isToolCallable("public", "search_knowledge"), true);
  assertEquals(findTool("public", "search_knowledge")?.scope, undefined);
});

// Invariante de segurança do tools/call: escopo é RECHECADO na chamada, não só escondido no
// tools/list. Uma tool fora de escopo é inchamável mesmo que o cliente saiba o nome exato.
Deno.test("isToolCallable recheca escopo no tools/call (não só esconde na listagem)", () => {
  // público: qualquer tool existente é chamável; inexistente não
  assertEquals(isToolCallable("public", "search_parking"), true);
  assertEquals(isToolCallable("public", "create_booking"), false); // não é tool pública
  assertEquals(isToolCallable("public", "inexistente"), false);
  // parceiro: precisa do escopo da tool
  assertEquals(isToolCallable("partner", "create_booking", ["bookings:write"]), true);
  assertEquals(isToolCallable("partner", "create_booking", ["bookings:read"]), false);
  assertEquals(isToolCallable("partner", "create_booking", []), false);
  // sabendo o nome mas sem escopo → inchamável (escalada de privilégio bloqueada)
  assertEquals(isToolCallable("partner", "update_pricing_rule", ["pricing:read"]), false);
  assertEquals(isToolCallable("partner", "update_pricing_rule", ["pricing:write"]), true);
  // tool inexistente no parceiro
  assertEquals(isToolCallable("partner", "get_faq", ["faq:read"]), false);
});

// Consistência: o que NÃO aparece no tools/list para um conjunto de escopos também NÃO pode ser
// chamado com esses escopos (a listagem e o gate de chamada não podem divergir).
Deno.test("isToolCallable é consistente com listTools para os mesmos escopos", () => {
  const scopes = ["bookings:read", "coupons:read"];
  const listed = new Set(listTools("partner", scopes).map((t) => t.name));
  for (const t of PARTNER_TOOLS) {
    assertEquals(
      isToolCallable("partner", t.name, scopes),
      listed.has(t.name),
      `${t.name}: chamável deve casar com listado`,
    );
  }
});

Deno.test("change_booking_dates é tool de parceiro sob bookings:write", () => {
  assertEquals(findTool("partner", "change_booking_dates")?.scope, "bookings:write");
  const names = listTools("partner", ["bookings:write"]).map((x) => x.name);
  assertEquals(names.includes("change_booking_dates"), true);
  // sem bookings:write não aparece nem é chamável
  assertEquals(listTools("partner", ["bookings:read"]).map((x) => x.name).includes("change_booking_dates"), false);
  assertEquals(isToolCallable("partner", "change_booking_dates", ["bookings:read"]), false);
  assertEquals(missingRequired(findTool("partner", "change_booking_dates")!, { booking_id: "b1" }), "check_in_at");
});

Deno.test("change_booking_vehicle é tool de parceiro sob bookings:write", () => {
  assertEquals(findTool("partner", "change_booking_vehicle")?.scope, "bookings:write");
  assertEquals(isToolCallable("partner", "change_booking_vehicle", ["bookings:write"]), true);
  assertEquals(isToolCallable("partner", "change_booking_vehicle", ["bookings:read"]), false);
  // só booking_id é obrigatório (vehicle_id OU license_plate validado em runtime no servidor)
  assertEquals(missingRequired(findTool("partner", "change_booking_vehicle")!, { booking_id: "b1" }), null);
  assertEquals(missingRequired(findTool("partner", "change_booking_vehicle")!, {}), "booking_id");
});

Deno.test("missingRequired aponta o primeiro campo faltante", () => {
  const t = findTool("partner", "get_booking")!;
  assertEquals(missingRequired(t, {}), "booking_id");
  assertEquals(missingRequired(t, { booking_id: "x" }), null);
  assertEquals(missingRequired(t, { booking_id: "" }), "booking_id");
});

Deno.test("todas as PARTNER_TOOLS têm escopo declarado", () => {
  assertEquals(PARTNER_TOOLS.every((t) => typeof t.scope === "string"), true);
});

// Regressão: `false`/`0` são valores VÁLIDOS de um campo required — não podem ser
// tratados como "faltando", senão desativar (is_active=false) / desbloquear (blocked=false)
// seria rejeitado antes de chegar na RPC.
Deno.test("missingRequired trata false/0 como presentes (desativar/desbloquear)", () => {
  const coupon = findTool("partner", "set_coupon_active")!; // required: id, is_active
  assertEquals(missingRequired(coupon, { id: "c1", is_active: false }), null);
  const block = findTool("partner", "set_date_blocked")!; // required: lpt, date, blocked
  assertEquals(
    missingRequired(block, { location_parking_type_id: "l1", date: "2026-06-01", blocked: false }),
    null,
  );
});

// Invariante de segurança: todo escopo de tool de parceiro segue o padrão do catálogo
// (recurso:ação) — pega typo tipo "booking:read" (singular) que furaria o gating.
Deno.test("todo escopo de PARTNER_TOOLS casa o padrão recurso:ação", () => {
  const re = /^[a-z-]+:(read|write|cancel|checkin)$/;
  const bad = PARTNER_TOOLS.filter((t) => !re.test(t.scope!));
  assertEquals(bad.map((t) => `${t.name}=${t.scope}`), []);
});

// ── superfície consumidor autenticado (/customer) ────────────────────────────
Deno.test("listTools customer = descoberta + login + reserva, sem chave de agente", () => {
  const names = listTools("customer").map((t) => t.name);
  // as 9 de leitura (mesmas do público)
  for (const t of listTools("public").map((x) => x.name)) {
    assertEquals(names.includes(t), true, `customer deve ter ${t}`);
  }
  // + login e reserva
  for (const t of ["request_login_otp", "verify_login_otp", "whoami", "create_booking"]) {
    assertEquals(names.includes(t), true, `customer deve ter ${t}`);
  }
  // sem chave de agente confiável, gerar link não aparece (session fixation, §9 item 6)
  assertEquals(names.includes("create_checkout_link"), false);
  assertEquals(listTools("customer", []).length, CUSTOMER_TOOLS.length - 1);
});

Deno.test("create_checkout_link só aparece/roda com a chave de agente confiável", () => {
  const semChave = listTools("customer", []).map((t) => t.name);
  const comChave = listTools("customer", ["checkout:link"]).map((t) => t.name);
  assertEquals(semChave.includes("create_checkout_link"), false);
  assertEquals(comChave.includes("create_checkout_link"), true);
  assertEquals(isToolCallable("customer", "create_checkout_link", []), false);
  assertEquals(isToolCallable("customer", "create_checkout_link", ["checkout:link"]), true);
});

Deno.test("isToolCallable no customer não depende de escopo", () => {
  assertEquals(isToolCallable("customer", "request_login_otp"), true);
  assertEquals(isToolCallable("customer", "search_parking"), true);
  assertEquals(isToolCallable("customer", "whoami"), true);
  assertEquals(isToolCallable("customer", "inexistente"), false);
  // tool de parceiro não vaza para o customer
  assertEquals(isToolCallable("customer", "update_pricing_rule"), false);
});

Deno.test("isToolCallable é consistente com listTools no customer", () => {
  const listed = new Set(listTools("customer").map((t) => t.name));
  for (const t of CUSTOMER_TOOLS) {
    assertEquals(isToolCallable("customer", t.name), listed.has(t.name), t.name);
  }
});

Deno.test("no customer só a de gerar link tem scope; o resto é gateado por JWT + RLS", () => {
  assertEquals(
    CUSTOMER_TOOLS.filter((t) => t.scope).map((t) => t.name),
    ["create_checkout_link"],
  );
});

// ── auth ─────────────────────────────────────────────────────────────────────
Deno.test("auth helpers", async () => {
  assertEquals(extractApiKey(new Headers({ Authorization: "Bearer mp_live_abc" })), "mp_live_abc");
  assertEquals(extractApiKey(new Headers({ "X-API-Key": "mp_test_xyz" })), "mp_test_xyz");
  assertEquals(extractApiKey(new Headers({})), null);
  assertEquals(keyPrefix("mp_live_8Kf2c1aQrest"), "mp_live_8Kf2c1aQ");
  assertEquals(hasScope(["bookings:read"], "bookings:read"), true);
  assertEquals(hasScope([], "x"), false);
  assertEquals(
    await sha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});


// ── Manager (superfície interna) ─────────────────────────────────────────────
//
// Ela existe porque escrita da Movepark não cabe nas outras duas: parceiro é
// tenant-scoped e consumidor é público. O que estes testes travam é o
// isolamento: sem escopo de plataforma ela não lista nem executa nada, e as
// tools dela não vazam para as outras superfícies.

Deno.test("Manager sem escopo não lista nem executa nada", () => {
  assertEquals(listTools("manager", []).length, 0);
  assertEquals(listTools("manager", ["locations:read", "bookings:write"]).length, 0);
  // Fora de escopo é tratado como inexistente: nem revela que a tool existe.
  assertEquals(isToolCallable("manager", "upsert_blog_post", []), false);
  assertEquals(isToolCallable("manager", "delete_blog_post", ["bookings:write"]), false);
});

Deno.test("blog:write abre as três tools do Manager", () => {
  const names = listTools("manager", ["blog:write"]).map((t) => t.name).sort();
  assertEquals(names, ["delete_blog_post", "publish_blog_post", "upsert_blog_post"]);
  for (const n of names) assertEquals(isToolCallable("manager", n, ["blog:write"]), true);
});

Deno.test("tool de Manager não existe nas superfícies de fora", () => {
  for (const t of MANAGER_TOOLS) {
    // Nem com o escopo na mão: a superfície é que decide, não só o escopo.
    assertEquals(isToolCallable("public", t.name), false);
    assertEquals(isToolCallable("partner", t.name, ["blog:write"]), false);
    assertEquals(isToolCallable("customer", t.name, ["blog:write"]), false);
    assertEquals(findTool("partner", t.name), null);
  }
});

Deno.test("toda tool do Manager exige escopo de plataforma", () => {
  // Tool sem `scope` fica visível para qualquer um que alcance a superfície.
  // Numa superfície interna isso seria um buraco, então a regra é dura.
  //
  // A asserção era `=== "blog:write"` enquanto o blog era a única coisa aqui. Isso
  // testava o inventário, não a invariante: a regra é "declara escopo de plataforma",
  // e ela tem que continuar valendo para a próxima tool que chegar.
  const DE_PLATAFORMA = new Set(["blog:write", "wl:read"]);
  for (const t of MANAGER_TOOLS) {
    assertEquals(typeof t.scope, "string", `${t.name} sem escopo`);
    assertEquals(DE_PLATAFORMA.has(t.scope!), true, `${t.name}: escopo ${t.scope}`);
  }
});

Deno.test("get_wl_mapping é do Manager, e só de lá", () => {
  // O mapeamento do white-label é fiação interna. Se um dia ele escorregar para o
  // /public, qualquer um passa a ter a lista de domínios e slugs dos parceiros.
  assertEquals(findTool("manager", "get_wl_mapping")?.scope, "wl:read");
  for (const superficie of ["public", "partner", "customer"] as const) {
    assertEquals(findTool(superficie, "get_wl_mapping"), null);
    assertEquals(isToolCallable(superficie, "get_wl_mapping", ["wl:read"]), false);
  }
  // Sem o escopo, some até do tools/list do Manager.
  assertEquals(isToolCallable("manager", "get_wl_mapping", []), false);
  assertEquals(isToolCallable("manager", "get_wl_mapping", ["blog:write"]), false);
  assertEquals(isToolCallable("manager", "get_wl_mapping", ["wl:read"]), true);
  // Não pede argumento nenhum: o agente chama e recebe o catálogo inteiro.
  assertEquals(missingRequired(findTool("manager", "get_wl_mapping")!, {}), null);
});

Deno.test("Manager valida os obrigatórios antes de escrever", () => {
  const upsert = findTool("manager", "upsert_blog_post")!;
  assertEquals(missingRequired(upsert, { title: "x", body_md: "y" }), "slug");
  assertEquals(missingRequired(upsert, { slug: "a", body_md: "y" }), "title");
  assertEquals(missingRequired(upsert, { slug: "a", title: "x", body_md: "y" }), null);
  assertEquals(missingRequired(findTool("manager", "delete_blog_post")!, {}), "slug");
});
