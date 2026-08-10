import { assert, assertEquals } from "jsr:@std/assert";
import {
  buildQuoteAnchor,
  pricesDiffer,
  sortByStaleness,
  START_BUDGET_MS,
  VERIFY_DURATIONS,
  verifyDurations,
} from "./logic.ts";

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

Deno.test("sem piso, a verificação usa a lista canônica", () => {
  assertEquals(verifyDurations(1), [1, 3, 6, 7, 15]);
});

Deno.test("com piso, a verificação descarta o que o parceiro recusaria", () => {
  // Abbapark, Nationpark e Plenty exigem 3 diárias: pedir 1 devolveria 400, e comparar erro com
  // preço marcaria a regra como divergente em toda passada.
  assertEquals(verifyDurations(3), [3, 6, 7, 15]);
});

Deno.test("o piso entra na lista mesmo quando não é uma das durações canônicas", () => {
  // Aeroparking exige 2. O 2 é justamente a duração mais vendida numa tabela com esse piso, e
  // ficaria de fora se só filtrássemos a lista canônica.
  assertEquals(verifyDurations(2), [2, 3, 6, 7, 15]);
});

Deno.test("a vaga nunca espelhada vai na frente de todas", () => {
  const fila = [
    { id: "velha", at: "2026-08-01T00:00:00Z" },
    { id: "nova", at: "2026-08-10T00:00:00Z" },
    { id: "nunca", at: null },
  ];
  assertEquals(
    sortByStaleness(fila, (r) => r.at).map((r) => r.id),
    ["nunca", "velha", "nova"],
  );
});

Deno.test("empate de carimbo não embaralha a fila", () => {
  const mesmo = "2026-08-10T00:00:00Z";
  const fila = [{ id: "a", at: mesmo }, { id: "b", at: mesmo }, { id: "c", at: mesmo }];
  assertEquals(sortByStaleness(fila, (r) => r.at).map((r) => r.id), ["a", "b", "c"]);
});

Deno.test("o orçamento cabe numa invocação da Edge", () => {
  // A Edge derruba em 150s sem resposta e uma vaga custa uns 45s. Começar uma vaga no limite do
  // orçamento tem que terminar antes do corte, senão a passada morre sem gravar nada.
  const CUSTO_DE_UMA_VAGA_MS = 45_000;
  const CORTE_DA_EDGE_MS = 150_000;
  assert(START_BUDGET_MS + CUSTO_DE_UMA_VAGA_MS < CORTE_DA_EDGE_MS);
});
