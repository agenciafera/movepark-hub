import { assertEquals } from "jsr:@std/assert";
import { customerTypeFor, documentDigits, hasValidCheckDigits, isValidChargeDocument } from "./documents.ts";

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

// Achado §16-2 / roteiro G4: o formulário do site valida dígito verificador, mas quem escreve pelo
// MCP (agente) não passa pelo formulário. Antes disto, CPF inválido era gravado e o usuário só
// descobria no pagamento. `isValidChargeDocument` (comprimento) segue valendo no gate de cobrança.
Deno.test("hasValidCheckDigits: aceita CPF e CNPJ com dígito verificador correto", () => {
  assertEquals(hasValidCheckDigits("390.533.447-05"), true);
  assertEquals(hasValidCheckDigits("39053344705"), true);
  assertEquals(hasValidCheckDigits("11.222.333/0001-81"), true); // CNPJ válido
});

Deno.test("hasValidCheckDigits: recusa sequência repetida e dígito errado", () => {
  // 111.111.111-11 passa pela conta do DV mas é CPF nulo: o front já recusava, a Edge não.
  assertEquals(hasValidCheckDigits("111.111.111-11"), false);
  assertEquals(hasValidCheckDigits("000.000.000-00"), false);
  assertEquals(hasValidCheckDigits("123.456.789-00"), false); // DV errado de fato
  assertEquals(hasValidCheckDigits("11.111.111/1111-11"), false);
});

Deno.test("hasValidCheckDigits: recusa comprimento inválido e vazio", () => {
  assertEquals(hasValidCheckDigits("123"), false);
  assertEquals(hasValidCheckDigits(""), false);
  assertEquals(hasValidCheckDigits(null), false);
});

// A diferença entre os dois é proposital e precisa continuar existindo.
Deno.test("o gate de cobrança é mais permissivo que a escrita (só comprimento)", () => {
  assertEquals(isValidChargeDocument("111.111.111-11"), true);
  assertEquals(hasValidCheckDigits("111.111.111-11"), false);
});
