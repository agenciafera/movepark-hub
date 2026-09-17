/**
 * Carimbo de frescor do post que publica preço (Conteúdo 26, Fase 2 do plano de conteúdo).
 *
 * Frescor é o critério de desempate quando duas fontes dizem o mesmo número: o modelo fica com
 * a datada. Até aqui a data do post era escrita à mão no texto ("em 27 de agosto de 2026"), e
 * envelhecia sem que nada quebrasse. O carimbo sai do banco (`destination_price_freshness`,
 * `max(pricing_rule.updated_at)`), então acompanha a revisão do parceiro sem ninguém editar o
 * post.
 */

/**
 * O post publica preço? É o que decide se o carimbo aparece.
 *
 * Só posts com valor em reais no corpo ganham a linha. Num guia de aeroporto sem tabela ela
 * seria ruído, e pior: dataria pelo preço uma página que não fala de preço.
 */
export function publicaPreco(bodyMd: string | null | undefined): boolean {
  return /R\$\s?\d/.test(bodyMd ?? "");
}

/**
 * O dia do carimbo, em `YYYY-MM-DD`.
 *
 * A tabela do parceiro é tocada várias vezes por dia pela sincronização, e o visitante lê data,
 * não hora. Cortar no dia faz o `dateModified` do schema bater exatamente com o que está na
 * tela, em vez de carregar um horário que a página nunca mostra.
 */
export function diaDoCarimbo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  /*
    Data sem horário volta como veio. Passar "2026-09-17" pelo `Date` a lê como meia-noite em
    UTC, e no fuso de Brasília ela retrocede um dia: o carimbo mostraria véspera.
  */
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const mes = `${d.getMonth() + 1}`.padStart(2, "0");
  const dia = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * `dateModified` do `BlogPosting`: a data mais recente entre a edição do texto e a tabela de
 * preço que a página exibe.
 *
 * A tabela entra na conta só quando o post publica preço, porque é aí que ela é conteúdo da
 * página. Sem essa condição, todo post do acervo passaria a se declarar modificado a cada
 * revisão de parceiro, que é frescor inventado e o Google trata como tal.
 */
export function dateModifiedDoPost(args: {
  publishedAt: string;
  updatedAt?: string | null;
  priceUpdatedAt?: string | null;
  publicaPreco: boolean;
}): string {
  const doTexto = args.updatedAt ?? args.publishedAt;
  if (!args.publicaPreco) return doTexto;

  const doPreco = diaDoCarimbo(args.priceUpdatedAt);
  if (!doPreco) return doTexto;

  /*
    Comparação por dia, em texto: `YYYY-MM-DD` ordena sozinho, e comparar `Date` misturaria
    meia-noite do carimbo com o horário da edição, decidindo empate pelo fuso de quem renderiza.
  */
  const diaDoTexto = diaDoCarimbo(doTexto);
  return !diaDoTexto || doPreco > diaDoTexto ? doPreco : doTexto;
}
