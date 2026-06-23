import { assertEquals } from "jsr:@std/assert";
import {
  extractFunctionCalls,
  extractText,
  functionResponseContent,
  geminiTools,
  needsLogin,
  parseChatRequest,
  toGeminiHistory,
  TOOLS,
  TRANSACTIONAL,
} from "./agent.logic.ts";

Deno.test("TOOLS: transacionais marcadas e demais são leitura", () => {
  assertEquals(TRANSACTIONAL.has("create_booking"), true);
  assertEquals(TRANSACTIONAL.has("cancel_booking"), true);
  assertEquals(TRANSACTIONAL.has("list_my_bookings"), true);
  assertEquals(TRANSACTIONAL.has("get_booking"), true);
  assertEquals(TRANSACTIONAL.has("search_parking"), false);
  assertEquals(TRANSACTIONAL.has("simulate_price"), false);
});

Deno.test("geminiTools devolve functionDeclarations sem campos internos", () => {
  const tools = geminiTools();
  assertEquals(tools.length, 1);
  const decls = tools[0].functionDeclarations;
  assertEquals(decls.length, TOOLS.length);
  // cada declaração só tem name/description/parameters (sem transactional)
  for (const d of decls) {
    assertEquals(Object.keys(d).sort(), ["description", "name", "parameters"]);
    assertEquals((d.parameters as { type: string }).type, "object");
    // Gemini não aceita additionalProperties no schema
    assertEquals("additionalProperties" in (d.parameters as Record<string, unknown>), false);
  }
});

Deno.test("parseChatRequest valida o corpo", () => {
  assertEquals(parseChatRequest({}).ok, false);
  assertEquals(parseChatRequest({ messages: [] }).ok, false);
  // última precisa ser do usuário
  assertEquals(parseChatRequest({ messages: [{ role: "user", text: "oi" }, { role: "model", text: "olá" }] }).ok, false);
  const ok = parseChatRequest({ messages: [{ role: "assistant", text: "olá" }, { role: "user", text: "quanto custa?" }] });
  assertEquals(ok.ok, true);
  if (ok.ok) {
    assertEquals(ok.value.messages.length, 2);
    assertEquals(ok.value.messages[1].text, "quanto custa?");
  }
  // aceita `content` como alias de `text`
  const alias = parseChatRequest({ messages: [{ role: "user", content: "buscar GRU" }] });
  assertEquals(alias.ok, true);
});

Deno.test("toGeminiHistory mapeia assistant→model", () => {
  const h = toGeminiHistory([
    { role: "user", text: "oi" },
    { role: "assistant", text: "olá" },
    { role: "model", text: "tudo bem?" },
  ]);
  assertEquals(h.map((c) => c.role), ["user", "model", "model"]);
  assertEquals(h[0].parts[0].text, "oi");
});

Deno.test("extractFunctionCalls / extractText", () => {
  const content = {
    role: "model" as const,
    parts: [{ text: "vou buscar" }, { functionCall: { name: "search_parking", args: { dest: "GRU" } } }],
  };
  assertEquals(extractFunctionCalls(content).map((c) => c.name), ["search_parking"]);
  assertEquals(extractText(content), "vou buscar");
  assertEquals(extractFunctionCalls(null), []);
  assertEquals(extractText({ role: "model", parts: [{ text: "a" }, { text: "b" }] }), "ab");
});

Deno.test("functionResponseContent monta o turno user com functionResponse", () => {
  const c = functionResponseContent([{ name: "simulate_price", response: { result: { price: 89.7 } } }]);
  assertEquals(c.role, "user");
  assertEquals(c.parts[0].functionResponse?.name, "simulate_price");
  assertEquals((c.parts[0].functionResponse?.response as { result: { price: number } }).result.price, 89.7);
});

Deno.test("needsLogin: transacional sem login → true; com login ou leitura → false", () => {
  assertEquals(needsLogin("create_booking", false), true);
  assertEquals(needsLogin("cancel_booking", false), true);
  assertEquals(needsLogin("create_booking", true), false);
  assertEquals(needsLogin("search_parking", false), false);
});
