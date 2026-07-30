import { assertEquals } from "jsr:@std/assert";
// `parseBrPhone` mora em _shared/payments/contact.ts e é testada lá.
import { buildPixItems, reaisToCents } from "./logic.ts";

Deno.test("reaisToCents converte reais → centavos", () => {
  assertEquals(reaisToCents(100), 10000);
  assertEquals(reaisToCents(29.9), 2990);
  assertEquals(reaisToCents(0.1), 10);
});

Deno.test("buildPixItems gera 1 item com o total", () => {
  const items = buildPixItems("MP-ABC", 10000);
  assertEquals(items.length, 1);
  assertEquals(items[0].amount, 10000);
  assertEquals(items[0].quantity, 1);
});
