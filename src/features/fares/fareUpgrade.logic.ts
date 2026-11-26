import { FARE_TIER_ORDER, type FareOption, type FareTier } from "@/lib/fares";

// Lógica pura do upgrade de tarifa (reunião de 26/11/2026): que colunas o comparativo mostra e qual
// tarifa ele sugere. O componente (FareUpgradeTable) só desenha.

/** As colunas do comparativo: a tarifa atual e as que estão acima dela, na ordem Básica, Flex, Superflex. */
export function upgradeColumns(catalog: FareOption[], currentTier: FareTier): FareOption[] {
  const atual = FARE_TIER_ORDER.indexOf(currentTier);
  return [...catalog]
    .filter((f) => FARE_TIER_ORDER.indexOf(f.tier) >= atual)
    .sort((a, b) => FARE_TIER_ORDER.indexOf(a.tier) - FARE_TIER_ORDER.indexOf(b.tier));
}

/** A sugestão inicial: a marcada como mais popular no catálogo, senão a primeira acima da atual. */
export function defaultUpgradeTarget(catalog: FareOption[], currentTier: FareTier): FareTier | null {
  const alvos = upgradeColumns(catalog, currentTier).filter((f) => f.tier !== currentTier);
  return (alvos.find((f) => f.is_popular) ?? alvos[0])?.tier ?? null;
}
