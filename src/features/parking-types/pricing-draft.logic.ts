import { USES_TIERS, type PricingStrategy } from "./strategies";

/** Faixa em edição (ainda não salva). */
export type TierLike = {
  from_day: number;
  to_day: number | null;
  unit_price: number | null;
  total_price: number | null;
};

/** Campos da regra que cada estratégia exige preenchidos. */
export type DraftRule = {
  incremental_one_day_price: number | null;
  incremental_two_days_price: number | null;
  incremental_base: number | null;
  incremental_multiplier: number | null;
  monthly_fixed_price: number | null;
  monthly_daily_rate: number | null;
  hourly_daily_rate: number | null;
  surcharge_source_id: string | null;
  surcharge_multiplier: number | null;
};

function hasPrice(t: TierLike): boolean {
  return (t.unit_price != null && t.unit_price > 0) || (t.total_price != null && t.total_price > 0);
}

/**
 * Por que a precificação não pode ser salva ainda, ou null se estiver pronta.
 * O botão de salvar fica desabilitado enquanto isso não for null: um save com a
 * estratégia trocada e os campos em branco apagava a tabela de preço da unidade.
 */
export function whyCannotSave(
  strategy: PricingStrategy,
  tiers: TierLike[],
  rule: DraftRule,
): string | null {
  if (USES_TIERS[strategy]) {
    if (tiers.length === 0) return "Adicione pelo menos uma faixa de preço.";
    if (!tiers.every(hasPrice)) return "Toda faixa precisa de um preço maior que zero.";
    return null;
  }

  switch (strategy) {
    case "incremental_formula":
      return rule.incremental_base != null && rule.incremental_multiplier != null
        ? null
        : "Informe a base e o multiplicador.";
    case "monthly_remainder":
      return rule.monthly_fixed_price != null
        ? null
        : "Informe o preço do pacote mensal.";
    case "hourly_capped":
      return rule.hourly_daily_rate != null ? null : "Informe o teto da diária.";
    case "surcharge":
      return rule.surcharge_source_id && rule.surcharge_multiplier != null
        ? null
        : "Escolha o tipo de vaga de origem e o multiplicador.";
    default:
      return null;
  }
}

/**
 * Trocar para uma estratégia sem faixas descarta as faixas já configuradas.
 * Quem responde true aqui precisa confirmar antes: é a tabela de preço da unidade.
 */
export function strategyChangeDropsTiers(
  next: PricingStrategy,
  tiers: TierLike[],
): boolean {
  return !USES_TIERS[next] && tiers.length > 0;
}
