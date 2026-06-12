import type { SimulatedPrice } from "./api";

/** Durações exibidas na tabela "ver preços" (consumer). */
export const DEFAULT_DURATIONS = [1, 2, 3, 5, 7, 10, 15, 30];

export type PriceRow = {
  days: number;
  label: string;
  /** Total da estadia (já descontado). null se indisponível/erro. */
  total: number | null;
  /** Preço por dia (total/days). null se sem total. */
  perDay: number | null;
  /** Preço "de" (riscado) quando maior que o total. null caso contrário. */
  oldPrice: number | null;
  /** Linha da duração buscada pelo usuário (destacada). */
  isSelected: boolean;
};

/**
 * Lista de durações a simular: os buckets padrão + a duração buscada (quando > 0),
 * únicos e ordenados — garante que a linha destacada exista na tabela.
 */
export function durationList(selected?: number): number[] {
  const set = new Set(DEFAULT_DURATIONS);
  if (selected && selected > 0) set.add(selected);
  return Array.from(set).sort((a, b) => a - b);
}

export function durationLabel(days: number): string {
  return `${days} ${days === 1 ? "diária" : "diárias"}`;
}

/**
 * Monta as linhas da tabela a partir das durações e dos resultados do simulate_price
 * (na mesma ordem). Tolera resultados ausentes/com erro (total = null).
 */
export function buildPriceRows(
  durations: number[],
  results: Array<SimulatedPrice | undefined>,
  selected?: number,
): PriceRow[] {
  return durations.map((days, i) => {
    const r = results[i];
    const total = r && !r.error && r.price != null ? r.price : null;
    const oldPrice = total != null && r?.old_price != null && r.old_price > total ? r.old_price : null;
    return {
      days,
      label: durationLabel(days),
      total,
      perDay: total != null && days > 0 ? total / days : null,
      oldPrice,
      isSelected: !!selected && selected > 0 && days === selected,
    };
  });
}
