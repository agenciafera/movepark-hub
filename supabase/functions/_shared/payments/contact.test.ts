import { assertEquals } from "jsr:@std/assert";
import { isValidPhoneBr, parseBrPhone, phoneDigits } from "./contact.ts";

// Casos consolidados das três cópias que existiam em create-pix-charge/logic.ts,
// create-fare-upgrade/logic.ts e change-booking-dates-paid/logic.ts.
Deno.test("parseBrPhone: extrai ddd/number, tirando o DDI 55", () => {
  assertEquals(parseBrPhone("+5511999998888"), { ddd: "11", number: "999998888" });
  assertEquals(parseBrPhone("+55 11 98772-7182"), { ddd: "11", number: "987727182" });
  assertEquals(parseBrPhone("11987727182"), { ddd: "11", number: "987727182" });
  assertEquals(parseBrPhone("(19) 98801-3420"), { ddd: "19", number: "988013420" });
  assertEquals(parseBrPhone("(11) 3333-4444"), { ddd: "11", number: "33334444" }); // fixo
});

Deno.test("parseBrPhone: recusa menos de 10 dígitos", () => {
  assertEquals(parseBrPhone("123"), null);
  assertEquals(parseBrPhone("98765-4321"), null); // 9 dígitos, sem DDD
  assertEquals(parseBrPhone("3456-7890"), null); // 8 dígitos, sem DDD
  assertEquals(parseBrPhone(""), null);
  assertEquals(parseBrPhone(null), null);
  assertEquals(parseBrPhone(undefined), null);
});

// A guarda do `> 11` existe por causa deste caso: 55 também é DDD (RS).
Deno.test("parseBrPhone: DDD 55 sobrevive (não é confundido com DDI)", () => {
  assertEquals(parseBrPhone("55987654321"), { ddd: "55", number: "987654321" });
  assertEquals(parseBrPhone("5533334444"), { ddd: "55", number: "33334444" });
  assertEquals(parseBrPhone("+5555987654321"), { ddd: "55", number: "987654321" });
});

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

// Uma regra só: a escrita aceita exatamente o que o gate consegue usar.
Deno.test("isValidPhoneBr é o booleano de parseBrPhone", () => {
  for (const v of ["11987654321", "+5511999998888", "(11) 3333-4444", "123", "", null, undefined]) {
    assertEquals(isValidPhoneBr(v), parseBrPhone(v) !== null, `divergiu em ${String(v)}`);
  }
});

Deno.test("phoneDigits: tira máscara", () => {
  assertEquals(phoneDigits("+55 (11) 98765-4321"), "5511987654321");
});
