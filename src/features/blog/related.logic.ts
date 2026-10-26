/**
 * Quais posts entram no "Leia também" da lateral do post.
 *
 * Era "os 3 mais recentes do mesmo destino", e essa regra deixa a cauda órfã para
 * sempre: em Viracopos são 22 posts publicados, e o bloco dos 22 apontava para os
 * mesmos 4 mais novos, enquanto os outros 18 não recebiam link de nenhum. Com o arquivo
 * do blog fora do sitemap (é `noindex`, Conteúdo 65), a auditoria de 26/10/2026 achou
 * 4 posts sem nenhum link vindo de página indexável.
 *
 * A regra agora é de VIZINHOS POR DATA dentro do destino: o post linka os que foram
 * publicados logo antes e logo depois dele. Isso garante que, em todo destino com dois
 * posts ou mais, cada post aparece como relacionado de pelo menos um outro, porque o
 * vizinho imediato dele está sempre a uma posição de distância, e na distância 1 cabem
 * no máximo dois candidatos, menos que os três lugares do bloco.
 *
 * Destino com um post só não tem vizinho: esse post é linkado pela página do destino,
 * que lista os 6 mais recentes dele (`fetchPostsDoDestino`, em `routes.tsx`).
 */

/** O mínimo que o bloco precisa: o card mostra miniatura, título e data. */
export type RelatedPost = {
  id: string;
  slug: string;
  title: string;
  published_at: string;
  cover_image_url: string | null;
};

/** Lugares do bloco. Com menos de 2 a garantia de cobertura deixa de valer. */
export const RELACIONADOS_POR_POST = 3;

/**
 * O acervo do destino em ordem: mais novo primeiro, e o slug desempata.
 *
 * O desempate não é detalhe: em Viracopos 22 posts dividem 16 datas, porque a migração
 * do WordPress carimbou lotes inteiros no mesmo dia. Sem ele a ordem dependeria do que o
 * banco devolvesse, e o vizinho de um post mudaria de um build para o outro.
 */
export function ordemDoDestino<T extends Pick<RelatedPost, "slug" | "published_at">>(
  posts: readonly T[],
): T[] {
  return [...posts].sort((a, b) => {
    const porData = Date.parse(b.published_at) - Date.parse(a.published_at);
    if (porData !== 0) return porData;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
}

/**
 * Os relacionados de `slugAtual`: os vizinhos mais próximos por data, sem ele mesmo.
 *
 * Na mesma distância ganha o mais novo, que é o que o leitor tende a querer. O bloco
 * sai na ordem do acervo (mais novo primeiro), que é a ordem das datas que ele mostra.
 *
 * Post que não está na lista (o cliente pode chegar antes do build que o conhece) cai
 * nos mais recentes do destino, que era a regra antiga.
 */
export function escolherRelacionados<T extends Pick<RelatedPost, "slug" | "published_at">>(
  posts: readonly T[],
  slugAtual: string,
  quantos = RELACIONADOS_POR_POST,
): T[] {
  const ordem = ordemDoDestino(posts);
  const i = ordem.findIndex((p) => p.slug === slugAtual);
  if (i < 0) return ordem.slice(0, quantos);

  return ordem
    .map((post, j) => ({ post, j }))
    .filter(({ j }) => j !== i)
    .sort((a, b) => Math.abs(a.j - i) - Math.abs(b.j - i) || a.j - b.j)
    .slice(0, quantos)
    .sort((a, b) => a.j - b.j)
    .map(({ post }) => post);
}
