import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyResult, nextBackoff, signPayload } from "./logic.ts";

Deno.test("nextBackoff: exponencial a partir de 2min, com teto 4h", () => {
  assertEquals(nextBackoff(1), 120);
  assertEquals(nextBackoff(2), 240);
  assertEquals(nextBackoff(3), 480);
  assertEquals(nextBackoff(20), 4 * 3600); // teto
});

Deno.test("classifyResult: 2xx entregue, resto retry", () => {
  assertEquals(classifyResult(200), "delivered");
  assertEquals(classifyResult(204), "delivered");
  assertEquals(classifyResult(400), "retry");
  assertEquals(classifyResult(500), "retry");
  assertEquals(classifyResult(0), "retry");
});

Deno.test("signPayload: HMAC-SHA256 hex determinístico (64 chars)", async () => {
  const a = await signPayload("s3cret", '{"x":1}');
  const b = await signPayload("s3cret", '{"x":1}');
  assertEquals(a, b);
  assertEquals(a.length, 64);
  assert(/^[0-9a-f]+$/.test(a));
  const c = await signPayload("outro", '{"x":1}');
  assert(c !== a); // segredo diferente → assinatura diferente
});
