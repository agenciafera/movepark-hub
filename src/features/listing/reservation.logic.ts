// Lógica pura da reserva (add-ons + total). Sem React/Supabase → testável (Vitest).

/**
 * Resumo da reserva que o ReservationCard publica pra fora (pro CTA fixo do mobile
 * espelhar o total real, estilo Airbnb, em vez de "A partir de").
 */
export type ReservationSummary = {
  /** Datas válidas + preço + disponibilidade prontos (o total faz sentido). */
  canReserve: boolean;
  /** Total da reserva quando `canReserve`; caso contrário, o preço de balcão (base). */
  total: number;
  days: number;
  from: Date | null;
  to: Date | null;
  /** Selo curto de cancelamento da tarifa escolhida (ex.: "Cancelamento grátis até 24h"). */
  cancellationLine: string;
};

export type AddOnOption = {
  id: string;
  name: string;
  description: string | null;
  price: number;
};

/** Add-ons selecionados, preservando a ordem do catálogo. */
export function selectedAddOns(options: AddOnOption[], selectedIds: string[]): AddOnOption[] {
  const set = new Set(selectedIds);
  return options.filter((o) => set.has(o.id));
}

/** Soma dos add-ons selecionados. */
export function addOnsTotal(options: AddOnOption[], selectedIds: string[]): number {
  return selectedAddOns(options, selectedIds).reduce((sum, o) => sum + o.price, 0);
}

/** Linha de tarifa vinda de `get_unit_fares` (tier no padrão do banco: `basica`/`flex`/`superflex`). */
export type UnitFareRow = { tier: string; price_cents: number };

/** UI usa `basic`; o banco usa `basica`. Demais tiers são idênticos. */
export const FARE_UI_TO_DB_TIER: Record<string, string> = {
  basic: "basica",
  flex: "flex",
  superflex: "superflex",
};

/**
 * Aplica preço/on-off REAIS da unidade (E2.8-f) sobre as tarifas-padrão:
 * sobrescreve `surcharge`/`tagline` com o preço efetivo e descarta tiers desativados.
 * Sem dados da unidade (catálogo não carregou) devolve os defaults intactos.
 */
export function mergeUnitFares<T extends { id: string; surcharge: number; tagline: string }>(
  defaults: T[],
  unitFares: UnitFareRow[],
  fmt: { reais: (cents: number) => number; brl: (reais: number) => string },
): T[] {
  if (unitFares.length === 0) return defaults;
  return defaults.flatMap((f) => {
    const dbTier = FARE_UI_TO_DB_TIER[f.id] ?? f.id;
    const uf = unitFares.find((u) => u.tier === dbTier);
    if (!uf) return []; // Tarifa desativada nesta unidade
    const surcharge = fmt.reais(uf.price_cents);
    return [{ ...f, surcharge, tagline: surcharge === 0 ? "Grátis" : `+ ${fmt.brl(surcharge)}` }];
  });
}

/**
 * Total da reserva: o desconto do cupom incide apenas no estacionamento
 * (nunca negativo); os serviços adicionais e a Tarifa (E2.8) entram por cima.
 */
export function bookingTotal(
  parkingPrice: number,
  discount: number,
  addOnsSum: number,
  farePrice = 0,
): number {
  return Math.max(0, parkingPrice - discount) + addOnsSum + farePrice;
}
