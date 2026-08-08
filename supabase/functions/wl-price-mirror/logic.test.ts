import { assert, assertEquals } from "jsr:@std/assert";
import { buildQuoteAnchor, pricesDiffer, VERIFY_DURATIONS } from "./logic.ts";

Deno.test("a âncora cai 30 dias à frente, ao meio-dia", () => {
  const a = buildQuoteAnchor(new Date("2026-08-08T09:37:00Z"));
  assertEquals(a.toISOString(), "2026-09-07T12:00:00.000Z");
});

Deno.test("a âncora nunca é no passado", () => {
  // Data passada o parceiro recusa, e a amostragem inteira morre na primeira chamada.
  const agora = new Date("2026-08-08T23:59:00Z");
  assert(buildQuoteAnchor(agora).getTime() > agora.getTime());
});

Deno.test("a âncora zera hora, para a fração não contaminar a busca binária", () => {
  const a = buildQuoteAnchor(new Date("2026-08-08T23:47:31Z"));
  assertEquals([a.getUTCHours(), a.getUTCMinutes(), a.getUTCSeconds()], [12, 0, 0]);
});

Deno.test("a verificação cobre uma duração por faixa, mais as bordas", () => {
  // 1 é a faixa de diária cheia; 6 e 7 são os dois lados da virada onde o preço muda; 15
  // pega a faixa longa. É onde um erro de mapeamento aparece primeiro.
  assertEquals([...VERIFY_DURATIONS], [1, 3, 6, 7, 15]);
});

Deno.test("compara preço em centavos", () => {
  // Comparar float faria 161.1 divergir de 161.10000000000002 e a vitrine cairia sozinha.
  assertEquals(pricesDiffer(161.1, 161.10000000000002), false);
  assertEquals(pricesDiffer(161.1, 161.11), true);
});

Deno.test("preço ausente conta como divergência", () => {
  // Motor que não devolveu número é caso de olhar, não de assumir que está tudo bem.
  assertEquals(pricesDiffer(161.1, Number.NaN), true);
  assertEquals(pricesDiffer(Number.NaN, 161.1), true);
});
