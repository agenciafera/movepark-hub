// Motor de preço em TypeScript usado pelo endpoint /simulate-price.
//
// ATENÇÃO: este NÃO é o motor canônico. O motor canônico é a função SQL `simulate_price`, com
// casos golden em `docs/simulacao-precos.md` e testes em `test/pricing/` e
// `supabase/tests/pricing.test.sql`. O que está aqui é uma segunda implementação das mesmas
// estratégias, e existe só porque o endpoint devolve uma grade inteira de uma vez.
//
// Separado do `index.ts` para poder ser testado sem subir servidor: é o mesmo padrão do
// `validate.ts` do submit-contact-message. Ver `engine.test.ts`, que exercita este arquivo com os
// mesmos valores golden do motor SQL, justamente para a divergência entre os dois aparecer.

export interface Tier {
  from_day: number;
  to_day: number | null;
  unit_price: number | null;
  total_price: number | null;
  is_old_price: boolean;
}

export interface PricingRow {
  company_name: string;
  company_slug: string;
  location_slug: string;
  location_name: string;
  parking_type_code: string;
  parking_type_name: string;
  strategy: string;
  old_price_strategy: string;
  old_price_multiplier: number | null;
  surcharge_multiplier: number | null;
  source_strategy: string | null;
  incremental_one_day_price: number | null;
  incremental_two_days_price: number | null;
  incremental_base: number | null;
  incremental_multiplier: number | null;
  monthly_fixed_price: number | null;
  monthly_daily_rate: number | null;
  tiers: Tier[];
  source_tiers: Tier[];
}

/**
 * As estratégias que este motor sabe calcular.
 *
 * `hourly_capped` fica de fora de propósito, e não por esquecimento: ela precisa dos brackets
 * horários (`pricing_hourly_bracket`), que a RPC `get_pricing_data` nem devolve. Antes de
 * 14/08/2026 o `default` do switch mandava 0 para ela, e o endpoint publicava R$ 0,00 para as
 * duas regras vivas que a praticam, com HTTP 200 e sem aviso nenhum. Preço zero em vitrine é
 * pior que erro: parece promoção. Agora sai `price: null` com `unsupported_strategy`.
 */
export const ESTRATEGIAS_SUPORTADAS = [
  "uniform_by_duration",
  "tiered_progressive",
  "fixed_bracket",
  "surcharge",
  "incremental_formula",
  "monthly_remainder",
] as const;

export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function findTier(tiers: Tier[], days: number): Tier | null {
  return tiers.find((t) => days >= t.from_day && (t.to_day === null || days <= t.to_day)) ?? null;
}

/**
 * Toda função de tabela devolve `null` quando a tabela não cobre o período pedido, e não 0.
 *
 * O 0 era o comportamento anterior e apareceu na produção de 14/08/2026 em duas situações
 * diferentes: unidade com estadia mínima (a faixa começa em 3 dias, e 1 dia saía R$ 0,00 em vez
 * do "não vendemos essa diária" que o motor SQL devolve) e a `hourly_capped`, que nem chega aqui.
 * Preço zero em página de vitrine lê como promoção; `null` diz o que é, que é ausência de preço.
 */
export function uniformByDuration(tiers: Tier[], days: number): number | null {
  const t = findTier(tiers, days);
  if (!t || t.unit_price == null) return null;
  return r2(days * t.unit_price);
}

export function tieredProgressive(tiers: Tier[], days: number): number | null {
  const sorted = [...tiers].sort((a, b) => a.from_day - b.from_day);
  let remaining = days;
  let total = 0;
  for (const tier of sorted) {
    if (remaining <= 0) break;
    const tierSize = tier.to_day != null ? tier.to_day - tier.from_day + 1 : remaining;
    const chunk = Math.min(remaining, tierSize);
    total += chunk * (tier.unit_price ?? 0);
    remaining -= chunk;
  }
  // Sobrou dia sem faixa: a tabela não alcança essa duração.
  if (remaining > 0) return null;
  return r2(total);
}

export function fixedBracket(tiers: Tier[], days: number): number | null {
  const t = findTier(tiers, days);
  if (!t) return null;
  // Os dois preenchidos: total_price é a base no from_day e unit_price é o excedente por dia
  // (ex.: valet do Aeropark a partir de 30 dias).
  if (t.unit_price != null && t.total_price != null) {
    return r2(t.total_price + (days - t.from_day) * t.unit_price);
  }
  if (t.total_price != null) return t.total_price;
  if (t.unit_price != null) return r2(days * t.unit_price);
  return null;
}

export function applyStrategy(strategy: string, tiers: Tier[], days: number): number | null {
  switch (strategy) {
    case "uniform_by_duration":
      return uniformByDuration(tiers, days);
    case "tiered_progressive":
      return tieredProgressive(tiers, days);
    case "fixed_bracket":
      return fixedBracket(tiers, days);
    default:
      return null;
  }
}

export type PriceResult = {
  /** null quando este motor não sabe calcular a estratégia da regra. */
  price: number | null;
  old_price: number | null;
  unsupported_strategy?: string;
};

export function computePrice(row: PricingRow, days: number): PriceResult {
  if (!(ESTRATEGIAS_SUPORTADAS as readonly string[]).includes(row.strategy)) {
    return { price: null, old_price: null, unsupported_strategy: row.strategy };
  }

  const mainTiers = row.tiers.filter((t) => !t.is_old_price);
  const oldTiers = row.tiers.filter((t) => t.is_old_price);

  let price: number | null;

  if (row.strategy === "surcharge") {
    const srcTiers = row.source_tiers.filter((t) => !t.is_old_price);
    const base = applyStrategy(row.source_strategy ?? "uniform_by_duration", srcTiers, days);
    price = base === null ? null : r2(base * (row.surcharge_multiplier ?? 1));
  } else if (row.strategy === "incremental_formula") {
    // `base + dias × multiplicador`, exatamente como a `simulate_price` do banco. Até
    // 14/08/2026 aqui estava `(dias - 2) × multiplicador`, e o endpoint publicava menos que o
    // motor canônico em toda estadia de 3 dias para cima: airpark/faro coberta em 5 dias saía
    // R$ 37,00 contra os R$ 55,00 do golden. Oito regras vivas praticavam a estratégia.
    if (days === 1) price = row.incremental_one_day_price ?? null;
    else if (days === 2) price = row.incremental_two_days_price ?? null;
    else price = r2((row.incremental_base ?? 0) + days * (row.incremental_multiplier ?? 0));
  } else if (row.strategy === "monthly_remainder") {
    const months = Math.floor(days / 30);
    const remainder = days % 30;
    price = r2(months * (row.monthly_fixed_price ?? 0) + remainder * (row.monthly_daily_rate ?? 0));
  } else {
    price = applyStrategy(row.strategy, mainTiers, days);
  }

  let old_price: number | null = null;
  if (price !== null && row.old_price_strategy === "multiplier" && row.old_price_multiplier != null) {
    old_price = r2(price * row.old_price_multiplier);
  } else if (price !== null && row.old_price_strategy === "own_table" && oldTiers.length > 0) {
    old_price = applyStrategy(row.strategy, oldTiers, days);
  }

  return { price, old_price };
}
