import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { nextBackoff } from "./logic.ts";

Deno.test("nextBackoff: exponencial a partir de 2min, teto 4h", () => {
  assertEquals(nextBackoff(1), 120);
  assertEquals(nextBackoff(2), 240);
  assertEquals(nextBackoff(3), 480);
  assertEquals(nextBackoff(0), 120); // guarda
  assertEquals(nextBackoff(99), 4 * 3600); // teto
});
