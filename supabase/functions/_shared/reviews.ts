/**
 * O piso de volume para a nota agregada valer como afirmação, no runtime do Deno.
 *
 * É cópia de `src/lib/reviews-volume.mjs`, porque a Edge não enxerga `src/`. Quem impede as
 * duas de divergirem é `src/features/reviews/volume.contract.test.ts`, do mesmo jeito que
 * `_shared/site.ts` faz com o host canônico. Ver docs/specs/reviews.md.
 */
export const MIN_AVALIACOES_PARA_NOTA = 5;

/** A unidade tem avaliações suficientes para a nota dela ordenar ou filtrar a busca? */
export function temVolumeParaNota(count: number | null | undefined): boolean {
  return (count ?? 0) >= MIN_AVALIACOES_PARA_NOTA;
}
