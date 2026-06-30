import { assertEquals } from "jsr:@std/assert";
import { customerTypeFor, documentDigits, isValidChargeDocument } from "./documents.ts";

Deno.test("documentDigits remove tudo que não é dígito", () => {
  assertEquals(documentDigits("390.533.447-05"), "39053344705");
  assertEquals(documentDigits("11.222.333/0001-81"), "11222333000181");
  assertEquals(documentDigits(null), "");
  assertEquals(documentDigits(undefined), "");
});

Deno.test("isValidChargeDocument aceita 11 (CPF) ou 14 (CNPJ) dígitos", () => {
  assertEquals(isValidChargeDocument("390.533.447-05"), true); // CPF
  assertEquals(isValidChargeDocument("11.222.333/0001-81"), true); // CNPJ
  assertEquals(isValidChargeDocument("123"), false);
  assertEquals(isValidChargeDocument("123456789012"), false); // 12 dígitos
  assertEquals(isValidChargeDocument(null), false);
});

Deno.test("customerTypeFor distingue CNPJ (company) de CPF (individual)", () => {
  assertEquals(customerTypeFor("11.222.333/0001-81"), "company");
  assertEquals(customerTypeFor("390.533.447-05"), "individual");
  assertEquals(customerTypeFor(null), "individual");
});
