// Fusão pura result×disponibilidade para a edge `search`.
// Mantida separada e sem dependência de Deno/Supabase para ser testável (deno test).

export interface AvailabilityRow {
  location_parking_type_id: string;
  capacity: number;
  remaining: number;
  sold_out: boolean;
  near_capacity: boolean;
  near_capacity_message: string | null;
}

export interface ResultAvailability {
  remaining: number | null;
  sold_out: boolean;
  near_capacity: boolean;
  near_capacity_message: string | null;
}

const FALLBACK: ResultAvailability = {
  remaining: null,
  sold_out: false,
  near_capacity: false,
  near_capacity_message: null,
};

/** Indexa o retorno de `availability_batch` por location_parking_type_id. */
export function buildAvailabilityMap(
  rows: AvailabilityRow[] | null | undefined,
): Map<string, ResultAvailability> {
  const map = new Map<string, ResultAvailability>();
  for (const r of rows ?? []) {
    map.set(r.location_parking_type_id, {
      remaining: r.remaining,
      sold_out: r.sold_out,
      near_capacity: r.near_capacity,
      near_capacity_message: r.near_capacity_message ?? null,
    });
  }
  return map;
}

/** Disponibilidade de um lpt; fallback "disponível/desconhecido" se ausente do lote. */
export function availabilityFor(
  map: Map<string, ResultAvailability>,
  lptId: string,
): ResultAvailability {
  return map.get(lptId) ?? FALLBACK;
}

/**
 * Comparador de empate: itens esgotados vão para o fim, independente do `sort`
 * escolhido (search-results.md §10 — esgotados permanecem na lista, sinalizados).
 * Retorna 0 quando ambos têm o mesmo status (deixa o sort principal decidir).
 */
export function soldOutTiebreak(a: ResultAvailability, b: ResultAvailability): number {
  return (a.sold_out ? 1 : 0) - (b.sold_out ? 1 : 0);
}
