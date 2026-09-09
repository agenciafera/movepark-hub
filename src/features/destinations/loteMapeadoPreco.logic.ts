/**
 * O preço pesquisado na ficha do lote mapeado.
 *
 * Existe por causa de uma contradição achada em 08/09/2026 na MESMA página do
 * Bandeira Park: o topo dizia "Preço: não informado. Este estacionamento ainda não
 * publica tarifas na Movepark" enquanto a FAQ logo abaixo dizia "R$ 18,49 na
 * descoberta", e a tabela da página do destino mostrava a mesma linha com "preço
 * pesquisado em 08/09/2026". As colunas `researched_*` existiam, a tabela do destino
 * as lia, e a ficha do lote não.
 *
 * A frase "não informado" continua valendo, e é importante que continue: quem chega
 * da busca precisa saber que a falta de preço é da oferta, não da página. O que muda
 * é que ela passa a ser a EXCEÇÃO, e não o texto fixo.
 *
 * O que este módulo não faz: inventar duração que não foi pesquisada. Lote com
 * diária e semana pesquisadas mostra duas linhas, não quatro com célula vazia.
 */

import type { ProspectCard } from "@/types/domain";

export type PrecoPesquisadoLinha = {
  days: number;
  label: string;
  total: number;
  /** Valor por dia, para a linha de mais de uma diária. */
  perDay: number;
};

export type PrecoPesquisado = {
  linhas: PrecoPesquisadoLinha[];
  /** Data da pesquisa (ISO). O schema do banco exige data quando há preço. */
  researchedAt: string;
};

const DURACOES: { days: number; campo: keyof ProspectCard; label: string }[] = [
  { days: 1, campo: "researched_daily_brl", label: "1 diária" },
  { days: 7, campo: "researched_weekly_brl", label: "7 diárias" },
  { days: 15, campo: "researched_biweekly_brl", label: "15 diárias" },
  { days: 30, campo: "researched_monthly_brl", label: "30 diárias" },
];

/**
 * As linhas de preço pesquisado do lote, ou null quando não há preço.
 *
 * Sem `researched_at` também devolve null, mesmo com valor preenchido: preço de
 * terceiro sem data é afirmação sem lastro, e a constraint do banco já diz isso.
 */
export function precoPesquisado(p: ProspectCard | null | undefined): PrecoPesquisado | null {
  if (!p?.researched_at) return null;
  const linhas: PrecoPesquisadoLinha[] = [];
  for (const d of DURACOES) {
    const bruto = p[d.campo];
    const total = typeof bruto === "string" ? Number(bruto) : (bruto as number | null);
    if (total == null || !Number.isFinite(total) || total <= 0) continue;
    linhas.push({ days: d.days, label: d.label, total, perDay: total / d.days });
  }
  return linhas.length > 0 ? { linhas, researchedAt: p.researched_at } : null;
}

/**
 * Posts do destino para a ficha do lote, com o da própria marca na frente.
 *
 * O casamento é por PREFIXO do slug (`bandeira-park` casa
 * `bandeira-park-viracopos`), e não por nome, porque nome tem acento, sufixo de
 * destino e maiúscula, e cada variação viraria um link perdido. Prefixo erra para o
 * lado seguro: no máximo não acha, e aí a lista fica só com os posts do destino.
 */
export function postsDoLote<T extends { slug: string }>(
  posts: T[] | undefined,
  prospectSlug: string | null | undefined,
  limite = 3,
): T[] {
  const lista = posts ?? [];
  if (!prospectSlug) return lista.slice(0, limite);
  const daMarca = lista.filter((p) => p.slug.startsWith(prospectSlug));
  const resto = lista.filter((p) => !p.slug.startsWith(prospectSlug));
  return [...daMarca, ...resto].slice(0, limite);
}
