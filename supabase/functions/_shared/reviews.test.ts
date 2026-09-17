import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MIN_AVALIACOES_PARA_NOTA, temVolumeParaNota } from "./reviews.ts";

/**
 * O piso que a busca usa para ordenar e filtrar por nota.
 *
 * O caso que ele fecha: até 17/09/2026, `sort=rating_desc` colocava um lote com uma
 * avaliação 5,0 acima de um com trezentas e 4,9, e `min_rating=4.5` deixava o mesmo lote
 * passar. Ranking assim premia quem mal foi avaliado.
 */
Deno.test("temVolumeParaNota: o piso é fechado no valor exato", () => {
  assertEquals(temVolumeParaNota(MIN_AVALIACOES_PARA_NOTA), true);
  assertEquals(temVolumeParaNota(MIN_AVALIACOES_PARA_NOTA - 1), false);
});

Deno.test("temVolumeParaNota: sem avaliação nenhuma é falso, e null não quebra", () => {
  assertEquals(temVolumeParaNota(0), false);
  assertEquals(temVolumeParaNota(null), false);
  assertEquals(temVolumeParaNota(undefined), false);
});
