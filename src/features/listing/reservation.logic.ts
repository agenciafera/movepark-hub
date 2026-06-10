// Lógica pura da reserva (add-ons + total). Sem React/Supabase → testável (Vitest).

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

/**
 * Total da reserva: o desconto do cupom incide apenas no estacionamento
 * (nunca negativo); os serviços adicionais entram por cima.
 */
export function bookingTotal(
  parkingPrice: number,
  discount: number,
  addOnsSum: number,
): number {
  return Math.max(0, parkingPrice - discount) + addOnsSum;
}
