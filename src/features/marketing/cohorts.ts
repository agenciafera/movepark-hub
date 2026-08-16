import type { MarketingCohort, MarketingGrowthStage } from "@/types/domain";

/**
 * Rótulos e leitura das coortes. Fica aqui, e não espalhado nos componentes, porque a mesma
 * coorte aparece na matriz, no kanban, no segmento e na campanha: um nome diferente em cada tela
 * faria o time achar que são públicos diferentes.
 *
 * A frase de cada coorte diz o que fazer com ela, não o que ela é. Quem abre a matriz quer saber
 * onde agir.
 */

export type CohortInfo = {
  label: string;
  hint: string;
  /** Token de cor do design system, usado no badge e na barra. */
  tone: "neutral" | "cyan" | "violet" | "green" | "amber" | "red";
};

export const COHORTS: Record<MarketingCohort, CohortInfo> = {
  lead: {
    label: "Lead",
    hint: "Está na base e ainda não comprou. Público de aquisição.",
    tone: "neutral",
  },
  primeira_compra: {
    label: "Primeira compra",
    hint: "Comprou uma vez. A segunda compra é o que define se fica.",
    tone: "cyan",
  },
  recorrente: {
    label: "Recorrente",
    hint: "Duas ou mais viagens, em cadência saudável.",
    tone: "violet",
  },
  campeao: {
    label: "Campeão",
    hint: "Compra muito e comprou faz pouco tempo. Vale tratar diferente.",
    tone: "green",
  },
  sazonal_ferias: {
    label: "Sazonal de férias",
    hint: "Concentra as viagens em janeiro, julho e dezembro.",
    tone: "amber",
  },
  em_risco: {
    label: "Em risco",
    hint: "Já passou do dobro do intervalo que costumava levar entre viagens.",
    tone: "amber",
  },
  inativo: {
    label: "Inativo",
    hint: "Sem comprar há mais de um ano.",
    tone: "red",
  },
};

export const GROWTH_STAGES: Record<MarketingGrowthStage, { label: string; hint: string }> = {
  aquisicao: { label: "Aquisição", hint: "Chegou na base e ainda não comprou." },
  ativacao: { label: "Ativação", hint: "Fez a primeira compra." },
  retencao: { label: "Retenção", hint: "Voltou a comprar." },
  reativacao: { label: "Reativação", hint: "Comprou e sumiu. Precisa de um empurrão." },
};

/** Ordem de exibição: do topo do funil para o fundo, e o inativo por último. */
export const COHORT_ORDER: MarketingCohort[] = [
  "lead",
  "primeira_compra",
  "recorrente",
  "campeao",
  "sazonal_ferias",
  "em_risco",
  "inativo",
];

export const GROWTH_STAGE_ORDER: MarketingGrowthStage[] = [
  "aquisicao",
  "ativacao",
  "retencao",
  "reativacao",
];

export function cohortLabel(cohort: string | null | undefined): string {
  if (!cohort) return "Sem dados";
  return COHORTS[cohort as MarketingCohort]?.label ?? cohort;
}

export function cohortTone(cohort: string | null | undefined): CohortInfo["tone"] {
  if (!cohort) return "neutral";
  return COHORTS[cohort as MarketingCohort]?.tone ?? "neutral";
}

export function growthStageLabel(stage: string | null | undefined): string {
  if (!stage) return "Sem dados";
  return GROWTH_STAGES[stage as MarketingGrowthStage]?.label ?? stage;
}

/** Classes do badge por tom. Uma função só, para o badge não divergir entre telas. */
export function toneClasses(tone: CohortInfo["tone"]): string {
  switch (tone) {
    case "cyan":
      return "bg-cyan-50 text-cyan-700 border-cyan-200";
    case "violet":
      return "bg-violet-50 text-violet-700 border-violet-200";
    case "green":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "amber":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "red":
      return "bg-rose-50 text-rose-700 border-rose-200";
    default:
      return "bg-neutral-100 text-neutral-700 border-neutral-200";
  }
}

/**
 * Percentual de uma parte sobre o total, protegido contra divisão por zero.
 * Base vazia devolve 0, e não NaN, para a tela não mostrar "NaN%".
 */
export function share(part: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.round((part / total) * 100);
}

/**
 * Taxa de conversão de um degrau do funil para o seguinte, sempre sobre o degrau anterior.
 * Sobre o topo daria um número bonito e inútil: o que interessa é onde a pessoa desiste.
 */
export function stepConversion(steps: Array<{ count: number }>, index: number): number {
  if (index <= 0) return 100;
  const anterior = steps[index - 1]?.count ?? 0;
  return share(steps[index]?.count ?? 0, anterior);
}
