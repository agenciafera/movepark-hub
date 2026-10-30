import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { emptySummary, keyMatches } from "./logic.ts";

Deno.test("keyMatches: só a chave exata do Vault autoriza", () => {
  assertEquals(keyMatches("abc123", "abc123"), true);
  assertEquals(keyMatches("abc124", "abc123"), false);
  assertEquals(keyMatches("abc12", "abc123"), false);
  assertEquals(keyMatches(null, "abc123"), false);
  assertEquals(keyMatches("", ""), false);
  assertEquals(keyMatches("abc123", null), false);
});

Deno.test("emptySummary: começa zerado", () => {
  assertEquals(emptySummary(), { delivered: 0, retried: 0, failed: 0, cancelled: 0, released: 0 });
});
