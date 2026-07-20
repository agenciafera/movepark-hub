import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { makeToken, prefixOf, sha256Hex } from "./logic.ts";

Deno.test("makeToken: segredo base62 longo, prefixo de 16 chars", () => {
  const { secret, prefix } = makeToken();
  assertEquals(secret.length, 32);
  assertEquals(prefix.length, 16);
  assertEquals(prefix, secret.slice(0, 16));
  assertEquals(/^[A-Za-z0-9]+$/.test(secret), true);
});

Deno.test("makeToken: segredos diferentes a cada chamada (entropia)", () => {
  assertNotEquals(makeToken().secret, makeToken().secret);
});

Deno.test("prefixOf: mesmo prefixo que makeToken derivaria", () => {
  const { secret, prefix } = makeToken();
  assertEquals(prefixOf(secret), prefix);
});

Deno.test("sha256Hex: vetor conhecido (string vazia)", async () => {
  assertEquals(
    await sha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

Deno.test("sha256Hex: determinístico e sensível ao input", async () => {
  assertEquals(await sha256Hex("abc"), await sha256Hex("abc"));
  assertNotEquals(await sha256Hex("abc"), await sha256Hex("abd"));
});
