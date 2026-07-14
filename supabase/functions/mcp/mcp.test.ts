import { assertEquals } from "jsr:@std/assert";
import {
  initializeResult,
  isJsonRpcRequest,
  isNotification,
  JSONRPC,
  MCP_PROTOCOL_VERSION,
  rpcError,
  rpcResult,
  toolTextContent,
} from "./protocol.ts";
import { findTool, isToolCallable, listTools, missingRequired, PARTNER_TOOLS, PUBLIC_TOOLS } from "./tools.ts";
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
