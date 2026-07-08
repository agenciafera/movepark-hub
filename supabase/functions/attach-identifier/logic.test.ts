import { assertEquals, assertMatch } from "jsr:@std/assert";
import { isChannel, normalizeIdentifier, hashCode, genCode } from "./logic.ts";

Deno.test("isChannel", () => {
  assertEquals(isChannel("phone"), true);
  assertEquals(isChannel("email"), true);
  assertEquals(isChannel("sms"), false);
  assertEquals(isChannel(null), false);
});

Deno.test("normalizeIdentifier: email lowercase + validação", () => {
  assertEquals(normalizeIdentifier("email", "  Ana@Ex.COM "), "ana@ex.com");
  assertEquals(normalizeIdentifier("email", "semarroba"), null);
  assertEquals(normalizeIdentifier("email", ""), null);
});

Deno.test("normalizeIdentifier: phone → E.164", () => {
  assertEquals(normalizeIdentifier("phone", "+55 (11) 99999-0001"), "+5511999990001");
  assertEquals(normalizeIdentifier("phone", "5511999990001"), "+5511999990001");
  assertEquals(normalizeIdentifier("phone", "123"), null); // curto demais
});

Deno.test("hashCode: determinístico e hex de 64 chars", async () => {
  const h1 = await hashCode("123456");
  const h2 = await hashCode("123456");
  assertEquals(h1, h2);
  assertMatch(h1, /^[0-9a-f]{64}$/);
  assertEquals(await hashCode("000000") === h1, false);
});

Deno.test("genCode: 6 dígitos", () => {
  for (let i = 0; i < 20; i++) assertMatch(genCode(), /^\d{6}$/);
});
