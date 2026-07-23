import { assertEquals } from "jsr:@std/assert";
import { chunkFaq, chunkProse, estimateTokens } from "./chunking.ts";
import { hashContent, nextBackoff } from "./logic.ts";

Deno.test("chunkFaq: 1 chunk com P/R juntos", () => {
  const c = chunkFaq("Tem traslado?", "Sim, gratuito.");
  assertEquals(c.length, 1);
  assertEquals(c[0], "P: Tem traslado?\nR: Sim, gratuito.");
});

Deno.test("chunkFaq: vazio -> zero chunks", () => {
  assertEquals(chunkFaq("", ""), []);
  assertEquals(chunkFaq(null, null), []);
});

Deno.test("chunkProse: texto vazio -> zero chunks (worker apaga os chunks da fonte)", () => {
  assertEquals(chunkProse(""), []);
  assertEquals(chunkProse(null), []);
  assertEquals(chunkProse("   \n\n  "), []);
});

Deno.test("chunkProse: parágrafos curtos cabem em 1 chunk", () => {
  const c = chunkProse("Primeiro parágrafo.\n\nSegundo parágrafo.");
  assertEquals(c.length, 1);
  assertEquals(c[0], "Primeiro parágrafo.\n\nSegundo parágrafo.");
});

Deno.test("chunkProse: empacota até o teto e quebra em mais de um chunk", () => {
  const p = "x".repeat(1000);
  const c = chunkProse([p, p, p].join("\n\n")); // 3x1000 + separadores > 1800
  assertEquals(c.length >= 2, true);
  // nenhum chunk passa muito do teto
  for (const ch of c) assertEquals(ch.length <= 1800, true);
});

Deno.test("chunkProse: parágrafo gigante quebra por tamanho", () => {
  const giant = "y".repeat(4000);
  const c = chunkProse(giant);
  assertEquals(c.length, 3); // 4000 / 1800 -> 3 pedaços
  assertEquals(c.join("").length, 4000);
});

Deno.test("estimateTokens: ~chars/4", () => {
  assertEquals(estimateTokens("abcd"), 1);
  assertEquals(estimateTokens("a".repeat(400)), 100);
});

Deno.test("hashContent: determinístico e sensível a mudança", async () => {
  const a = await hashContent("texto igual");
  const b = await hashContent("texto igual");
  const c = await hashContent("texto diferente");
  assertEquals(a, b);
  assertEquals(a === c, false);
  assertEquals(a.length, 64); // sha256 hex
});

Deno.test("nextBackoff: 2min dobrando, teto 4h", () => {
  assertEquals(nextBackoff(1), 120);
  assertEquals(nextBackoff(2), 240);
  assertEquals(nextBackoff(3), 480);
  assertEquals(nextBackoff(99), 4 * 3600);
});
