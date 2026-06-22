export type PricingStrategy =
  | "tiered_progressive"
  | "uniform_by_duration"
  | "fixed_bracket"
  | "incremental_formula"
  | "monthly_remainder"
  | "hourly_capped"
  | "surcharge";

export type FractionalDayPolicy =
  | "any_extra"
  | "hour_tolerance"
  | "threshold_with_minutes"
  | "time_of_day"
  | "none";

export type OldPriceStrategy = "none" | "multiplier" | "own_table";

export const STRATEGIES: { value: PricingStrategy; label: string; description: string }[] = [
  {
    value: "tiered_progressive",
    label: "Diária Progressiva",
    description:
      "Cada faixa de dias tem seu próprio preço por dia; o total é a soma das camadas.",
  },
  {
    value: "uniform_by_duration",
    label: "Diária Uniforme por Duração",
    description:
      "O total de dias escolhe uma única taxa, aplicada a todos os dias da reserva.",
  },
  {
    value: "fixed_bracket",
    label: "Valor Fixo por Faixa",
    description: "Cada faixa de dias tem um valor total fixo (não multiplica por dia).",
  },
  {
    value: "incremental_formula",
    label: "Fórmula Incremental",
    description:
      "Preços especiais p/ 1 e 2 dias; a partir do 3º usa base + (dias × multiplicador).",
  },
  {
    value: "monthly_remainder",
    label: "Mensal + Resto Diário",
    description:
      "Cobra pacotes de 30 dias e os dias avulsos restantes à diária. 15-30 dias = pacote.",
  },
  {
    value: "hourly_capped",
    label: "Por Hora com Teto Diário",
    description: "Granular por minuto/hora, com teto de diária. Curta permanência.",
  },
  {
    value: "surcharge",
    label: "Sobretaxa sobre Outro Tipo",
    description:
      "Herda o cálculo de outro tipo de vaga e aplica um multiplicador percentual.",
  },
];

export const FRACTIONAL_POLICIES: {
  value: FractionalDayPolicy;
  label: string;
  helper?: string;
}[] = [
  { value: "any_extra", label: "Qualquer minuto extra conta +1 dia" },
  { value: "hour_tolerance", label: "Adiciona +1 dia só se passar da tolerância (horas)" },
  {
    value: "threshold_with_minutes",
    label: "Adiciona +1 dia se passou 1h+ E há minutos extras",
  },
  {
    value: "time_of_day",
    label: "Adiciona +1 dia só se check-out for após hora X do próximo dia",
    helper: "Tolerance representa a hora (ex: 1 = 01h)",
  },
  { value: "none", label: "Sem arredondamento (dias exatos)" },
];

export const OLD_PRICE_STRATEGIES: { value: OldPriceStrategy; label: string }[] = [
  { value: "none", label: "Sem preço de balcão" },
  { value: "multiplier", label: "Multiplicador sobre o preço calculado" },
  { value: "own_table", label: "Tabela própria de faixas (linhas marcadas)" },
];

export const STRATEGY_LABEL: Record<PricingStrategy, string> = Object.fromEntries(
  STRATEGIES.map((s) => [s.value, s.label]),
) as Record<PricingStrategy, string>;

/** Estratégias que usam pricing_tier */
export const USES_TIERS: Record<PricingStrategy, boolean> = {
  tiered_progressive: true,
  uniform_by_duration: true,
  fixed_bracket: true,
  incremental_formula: false,
  monthly_remainder: false,
  hourly_capped: false,
  surcharge: false,
};

/** Estratégias em que cada tier representa preço diário (vs preço total fixo) */
export function tierUsesUnitPrice(strategy: PricingStrategy): boolean {
  return strategy === "tiered_progressive" || strategy === "uniform_by_duration";
}
