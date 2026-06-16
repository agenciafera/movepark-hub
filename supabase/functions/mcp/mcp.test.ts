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
import { findTool, listTools, missingRequired, PARTNER_TOOLS, PUBLIC_TOOLS } from "./tools.ts";
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

Deno.test("findTool resolve por endpoint", () => {
  assertEquals(findTool("public", "get_faq")?.name, "get_faq");
  assertEquals(findTool("partner", "create_booking")?.scope, "bookings:write");
  assertEquals(findTool("partner", "get_faq"), null);
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
