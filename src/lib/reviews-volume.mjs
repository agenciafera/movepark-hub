/**
 * O piso de volume para publicar nota agregada. Um lugar só, três runtimes.
 *
 * Por que existe (Conteúdo 30, 17/09/2026). Nota média sobre poucas opiniões não descreve o
 * lote, descreve o último cliente: com 2 avaliações, uma nota 3 derruba um 5,0 para 4,0, e
 * com 4 ainda derruba 0,5. A partir de 5 a média começa a se mover devagar o bastante para
 * ser afirmação, e é isso que a página publica. Publicar "nota 5,0" sobre uma avaliação é
 * pior que não publicar: a IA repete o número, o leitor decide por ele, e nada disso se
 * sustenta na primeira avaliação seguinte.
 *
 * O piso vale para a Movepark e para o Google: a fonte muda, a aritmética não.
 *
 * Quem consome: o front (`reviews.logic.ts`, `jsonld.ts`, componentes de nota), o script do
 * artefato de preços (`scripts/price-index-json.mjs`, node puro, que não lê TS) e o Deno das
 * Edge Functions, cuja cópia vive em `supabase/functions/_shared/reviews.ts`. As duas
 * declarações são soldadas por `src/features/reviews/volume.contract.test.ts`, do mesmo
 * jeito que o host canônico em `site-host.mjs`.
 */
export const MIN_AVALIACOES_PARA_NOTA = 5;

/** A unidade tem avaliações suficientes para a nota dela virar afirmação pública? */
export function temVolumeParaNota(count) {
  return (count ?? 0) >= MIN_AVALIACOES_PARA_NOTA;
}
