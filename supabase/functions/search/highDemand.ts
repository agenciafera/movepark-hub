// Fusão pura result×sinal-de-demanda pra edge `search` (E3.6, recorte "N reservaram hoje").
// Mantida separada e sem dependência de Deno/Supabase pra ser testável (deno test).
//
// `locations_high_demand_today` (RPC) devolve só os location_id que cruzaram o limiar —
// nunca a contagem (não vaza volume de vendas, mesmo princípio de `popular_locations`).
// Por isso o resultado vira um Set de presença, não um mapa de números.

export interface HighDemandRow {
  location_id: string;
}

/** Indexa o retorno de `locations_high_demand_today` como um Set de presença. */
export function buildHighDemandSet(rows: HighDemandRow[] | null | undefined): Set<string> {
  return new Set((rows ?? []).map((r) => r.location_id));
}

/** location entrou no sinal de alta demanda hoje? */
export function isHighDemandToday(set: Set<string>, locationId: string): boolean {
  return set.has(locationId);
}
