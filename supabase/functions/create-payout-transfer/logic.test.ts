import { assertEquals } from "jsr:@std/assert";
import { decidePreflight, parseTransferInput } from "./logic.ts";

Deno.test("parseTransferInput: exige empresa e valor", () => {
  assertEquals(parseTransferInput(null).error, "company_id é obrigatório.");
  assertEquals(parseTransferInput({ company_id: "c1" }).error, "amount_cents é obrigatório.");
});

Deno.test("parseTransferInput: valor tem que ser inteiro positivo em centavos", () => {
  assertEquals(parseTransferInput({ company_id: "c1", amount_cents: 0 }).input, null);
  assertEquals(parseTransferInput({ company_id: "c1", amount_cents: -5 }).input, null);
  assertEquals(parseTransferInput({ company_id: "c1", amount_cents: 10.5 }).input, null);
  assertEquals(parseTransferInput({ company_id: "c1", amount_cents: "7650" }).input, null);
});

Deno.test("parseTransferInput: pedido válido passa", () => {
  const { input } = parseTransferInput({ company_id: "c1", amount_cents: 7650 });
  assertEquals(input, { companyId: "c1", amountCents: 7650 });
});

Deno.test("decidePreflight: saldo suficiente libera", () => {
  assertEquals(decidePreflight({ amountCents: 7650, availableCents: 11329 }).ok, true);
});

Deno.test("decidePreflight: saldo exato libera", () => {
  assertEquals(decidePreflight({ amountCents: 7650, availableCents: 7650 }).ok, true);
});

Deno.test("decidePreflight: saldo insuficiente barra e diz quanto falta", () => {
  const d = decidePreflight({ amountCents: 7650, availableCents: 1000 });
  assertEquals(d.ok, false);
  assertEquals(d.reason?.includes("66,50"), true);
});

Deno.test("decidePreflight: saldo desconhecido barra, em vez de tentar às cegas", () => {
  // Melhor recusar com motivo do que mandar um repasse que o gateway vai recusar por saldo.
  assertEquals(decidePreflight({ amountCents: 100, availableCents: null }).ok, false);
});
