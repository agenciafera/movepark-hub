/**
 * Preço "a partir de" da vitrine da home, calculado direto da tabela do lote.
 *
 * A home montava o card com o preço de 1 diária e descartava quem não tivesse
 * (`price == null`). Só que metade das unidades de aeroporto vende estadia longa e começa a
 * tabela em 3 diárias, então elas sumiam da home inteira, sem nada indicando o motivo. Aqui
 * o preço cai para a menor duração que a unidade de fato vende, e a duração vai junto para
 * o card não mostrar um valor de 3 diárias com rótulo de 1.
 *
 * Lógica pura (sem rede) para ser testável: a query mora em `api.ts`.
 */

export type PricingTierRaw = {
  from_day: number;
  to_day: number | null;
  total_price: number | null;
  unit_price: number | null;
  is_old_price: boolean;
};

export type PricingRuleRaw = {
  strategy: string;
  incremental_one_day_price: number | null;
  old_price_strategy: string;
  old_price_multiplier: number | null;
  hourly_daily_rate: number | null;
  pricing_tier: PricingTierRaw[];
};

/** Preço mostrado no card e a duração que ele cobre. */
export type FromPrice = {
  price: number;
  oldPrice: number | null;
  /** Diárias que o `price` cobre: 1 no caso normal, a estadia mínima quando é o caso. */
  days: number;
};

function tierFor(tiers: PricingTierRaw[], days: number): PricingTierRaw | null {
  return tiers.find((t) => t.from_day <= days && (t.to_day === null || t.to_day >= days)) ?? null;
}

/** Dinheiro com 2 casas: `23.9 * 3` em ponto flutuante dá 71.69999999999999. */
function money(value: number): number {
  return Number(value.toFixed(2));
}

/** Total da faixa para `days` diárias, respeitando tabela por total ou por diária. */
function totalFromTier(tier: PricingTierRaw | null, days: number): number | null {
  if (!tier) return null;
  if (tier.total_price != null) return tier.total_price;
  return tier.unit_price != null ? money(tier.unit_price * days) : null;
}

/** Menor duração com faixa na tabela, ou `null` quando a estratégia não usa tabela. */
function firstSellableDays(tiers: PricingTierRaw[]): number | null {
  if (tiers.length === 0) return null;
  return Math.min(...tiers.map((t) => t.from_day));
}

/**
 * Preço de partida do lote. Tenta 1 diária; se a tabela só começa depois, usa a primeira
 * faixa que existe e devolve a duração correspondente.
 *
 * Devolve `null` quando não há como calcular sem inventar (estratégia sem tabela e sem preço
 * de referência, ou dado incompleto). Aí o lote continua fora da vitrine, como antes.
 */
export function calcFromPrice(rule: PricingRuleRaw | null): FromPrice | null {
  if (!rule) return null;

  const tiers = (rule.pricing_tier ?? []).filter((t) => !t.is_old_price);
  const oldTiers = (rule.pricing_tier ?? []).filter((t) => t.is_old_price);

  let price: number | null = null;
  let days = 1;

  switch (rule.strategy) {
    // Estratégias sem tabela por faixa: o preço da diária já é o campo da regra.
    case "incremental_formula":
      price = rule.incremental_one_day_price;
      break;
    case "hourly_capped":
      price = rule.hourly_daily_rate;
      break;
    // Estratégias com tabela: 1 diária quando existe, senão a primeira faixa vendável.
    case "uniform_by_duration":
    case "fixed_bracket": {
      price = totalFromTier(tierFor(tiers, 1), 1);
      if (price == null) {
        const first = firstSellableDays(tiers);
        if (first != null && first > 1) {
          const total = totalFromTier(tierFor(tiers, first), first);
          if (total != null) {
            price = total;
            days = first;
          }
        }
      }
      break;
    }
    // tiered_progressive, surcharge e monthly_remainder ficam de fora: o total depende de
    // somar faixas ou de dados que não estão na regra, e chutar aqui viraria preço errado
    // no card. O motor (`simulate_price`) continua sendo a autoridade no checkout.
  }

  if (price == null) return null;

  let oldPrice: number | null = null;
  if (rule.old_price_strategy === "multiplier" && rule.old_price_multiplier) {
    oldPrice = money(price * rule.old_price_multiplier);
  } else if (rule.old_price_strategy === "own_table") {
    oldPrice = totalFromTier(tierFor(oldTiers, days), days);
  }
  // "De" que não é maior que o "por" não é desconto, é ruído riscado no card.
  if (oldPrice != null && oldPrice <= price) oldPrice = null;

  return { price, oldPrice, days };
}
