import type { MarketingRfmSegment } from "@/types/domain";

/**
 * Vocabulário e geometria da matriz RFM.
 *
 * A matriz da proposta é Recência (5 colunas) × Frequência (4 linhas), mas o score de frequência
 * vai de 1 a 5. As linhas F3 e F2/F1 se juntam: "média" é F3 e "baixa" é F2 ou F1. A junção mora
 * aqui, num lugar só, porque ela precisa ser a mesma no rótulo, na cor e na célula desenhada.
 */

export const RFM_LABELS: Record<MarketingRfmSegment, string> = {
  campeoes: "Campeões",
  fieis: "Fiéis",
  recorrentes: "Recorrentes",
  potenciais: "Potenciais",
  novos: "Novos",
  ocasionais: "Ocasionais",
  oportunidade: "Oportunidade",
  atencao: "Atenção",
  recuperar: "Recuperar",
  em_risco: "Em risco",
  alto_risco: "Alto risco",
  inativos: "Inativos",
  perdidos: "Perdidos",
  perdidos_vip: "Perdidos VIP",
};

export function rfmLabel(segment: string): string {
  return RFM_LABELS[segment as MarketingRfmSegment] ?? segment;
}

/** Colunas da matriz, do mais recente para o mais frio. */
export const RECENCIA_COLUNAS = [
  { score: 5, label: "Muito recente" },
  { score: 4, label: "Recente" },
  { score: 3, label: "Atenção" },
  { score: 2, label: "Em risco" },
  { score: 1, label: "Inativo" },
] as const;

/** Linhas da matriz, da maior frequência para a menor. `scores` é o que cai em cada linha. */
export const FREQUENCIA_LINHAS = [
  { label: "Muito frequente", scores: [5] },
  { label: "Frequente", scores: [4] },
  { label: "Média", scores: [3] },
  { label: "Baixa", scores: [2, 1] },
] as const;

/**
 * O rótulo de cada célula, igual à tabela da pág. 7 da proposta. É a mesma decisão que roda no
 * Postgres (`marketing_contact_rfm`); aqui ela serve para desenhar a célula vazia, que o banco
 * nunca devolve porque ninguém caiu nela.
 */
const CELULAS: Record<string, MarketingRfmSegment> = {
  "5-5": "campeoes",
  "5-4": "fieis",
  "5-3": "recuperar",
  "5-2": "alto_risco",
  "5-1": "perdidos_vip",
  "4-5": "fieis",
  "4-4": "recorrentes",
  "4-3": "atencao",
  "4-2": "em_risco",
  "4-1": "inativos",
  "3-5": "potenciais",
  "3-4": "potenciais",
  "3-3": "oportunidade",
  "3-2": "inativos",
  "3-1": "perdidos",
  "1-5": "novos",
  "1-4": "ocasionais",
  "1-3": "ocasionais",
  "1-2": "inativos",
  "1-1": "perdidos",
};

/** `fScore` 2 e 1 dividem a mesma linha, então os dois consultam a chave de F1. */
export function celulaSegmento(fScore: number, rScore: number): MarketingRfmSegment {
  const linha = fScore >= 3 ? fScore : 1;
  return CELULAS[`${linha}-${rScore}`] ?? "perdidos";
}

export type TomDaCelula = "forte" | "bom" | "morno" | "risco" | "frio" | "vazio";

/**
 * O tom da célula sai da posição na matriz, não do nome do segmento: quem está mais à esquerda
 * (recente) e mais em cima (frequente) é mais quente. Assim uma célula nova não fica sem cor.
 */
export function tomDaCelula(fScore: number, rScore: number, contatos: number): TomDaCelula {
  if (contatos === 0) return "vazio";
  // O risco vem ANTES da escada de calor, e não depois. Quem volta muito e parou de aparecer
  // (F alto, R baixo) somava calor suficiente para sair "morno" ou até "bom", justo na célula que
  // mais pede ação. A frequência alta não pode pintar de quente quem está indo embora.
  if (rScore <= 2 && fScore >= 4) return "risco";
  const calor = rScore + (fScore >= 3 ? fScore : 1);
  if (calor >= 9) return "forte";
  if (calor >= 7) return "bom";
  if (calor >= 5) return "morno";
  return "frio";
}

/** Participação do segmento sobre os elegíveis, em percentual inteiro (o "18%" do mockup). */
export function participacao(contatos: number, elegiveis: number): number {
  if (elegiveis <= 0) return 0;
  return Math.round((contatos / elegiveis) * 100);
}

/**
 * A base é grande o bastante para o rótulo RFM significar alguma coisa?
 *
 * O quintil sempre preenche as cinco faixas, mesmo com seis pessoas. Abaixo de 25 elegíveis, cada
 * faixa tem menos de cinco pessoas e "campeão" quer dizer "o melhor entre poucos". A tela precisa
 * dizer isso em vez de deixar o gestor agir sobre um rótulo que não se sustenta.
 */
export const MINIMO_PARA_RFM_CONFIAVEL = 25;

export function baseSuficiente(elegiveis: number): boolean {
  return elegiveis >= MINIMO_PARA_RFM_CONFIAVEL;
}
