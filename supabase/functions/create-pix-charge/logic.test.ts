import { assertEquals } from "jsr:@std/assert";
import { buildPixItems, parseBrPhone, reaisToCents } from "./logic.ts";

Deno.test("reaisToCents converte reais → centavos", () => {
  assertEquals(reaisToCents(100), 10000);
  assertEquals(reaisToCents(29.9), 2990);
  assertEquals(reaisToCents(0.1), 10);
});

Deno.test("parseBrPhone extrai ddd/number, tirando +55", () => {
  assertEquals(parseBrPhone("+5511999998888"), { ddd: "11", number: "999998888" });
  assertEquals(parseBrPhone("(11) 3333-4444"), { ddd: "11", number: "33334444" });
  assertEquals(parseBrPhone("123"), null);
  assertEquals(parseBrPhone(null), null);
});

Deno.test("buildPixItems gera 1 item com o total", () => {
  const items = buildPixItems("MP-ABC", 10000);
  assertEquals(items.length, 1);
  assertEquals(items[0].amount, 10000);
  assertEquals(items[0].quantity, 1);
});
