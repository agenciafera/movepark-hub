import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizePhone } from "./logic.ts";

Deno.test("normalizePhone: E.164 a partir de dígitos com máscara", () => {
  assertEquals(normalizePhone("(11) 98765-4321"), "+11987654321");
  assertEquals(normalizePhone("+55 11 98765-4321"), "+5511987654321");
  assertEquals(normalizePhone("11987654321"), "+11987654321");
});

Deno.test("normalizePhone: rejeita curto/longo demais e vazio", () => {
  assertEquals(normalizePhone("123"), null);
  assertEquals(normalizePhone("1".repeat(16)), null);
  assertEquals(normalizePhone(""), null);
  assertEquals(normalizePhone("   "), null);
});

Deno.test("normalizePhone: rejeita não-string", () => {
  assertEquals(normalizePhone(undefined), null);
  assertEquals(normalizePhone(null), null);
  assertEquals(normalizePhone(5511987654321), null);
});

Deno.test("normalizePhone: mantém só dígitos, prefixa +", () => {
  assertEquals(normalizePhone("+5511987654321"), "+5511987654321");
  assertEquals(normalizePhone("abc11987654321xyz"), "+11987654321");
});
