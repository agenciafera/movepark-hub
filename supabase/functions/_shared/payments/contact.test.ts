import { assertEquals } from "jsr:@std/assert";
import { isValidPhoneBr, phoneDigits } from "./contact.ts";

Deno.test("isValidPhoneBr: aceita celular e fixo com DDD, com ou sem DDI", () => {
  assertEquals(isValidPhoneBr("(11) 98765-4321"), true); // celular
  assertEquals(isValidPhoneBr("11987654321"), true);
  assertEquals(isValidPhoneBr("+55 11 98765-4321"), true); // com DDI
  assertEquals(isValidPhoneBr("(11) 3456-7890"), true); // fixo
});

// Achado G5 do roteiro: sem DDD, o PIX recusa lá na frente com 422. Recusamos na escrita.
Deno.test("isValidPhoneBr: recusa sem DDD e vazio", () => {
  assertEquals(isValidPhoneBr("98765-4321"), false); // 9 dígitos, sem DDD
  assertEquals(isValidPhoneBr("3456-7890"), false);
  assertEquals(isValidPhoneBr(""), false);
  assertEquals(isValidPhoneBr(null), false);
  assertEquals(isValidPhoneBr(undefined), false);
});

Deno.test("phoneDigits: tira máscara", () => {
  assertEquals(phoneDigits("+55 (11) 98765-4321"), "5511987654321");
});
