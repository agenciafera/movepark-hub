// Facetas de busca (operadora + destino) e filtros correspondentes — lógica pura,
// sem dependência de Deno/Supabase, para ser testável (deno test).
//
// As facetas alimentam a sidebar de filtros: cada faceta é calculada sobre o conjunto
// já precificado/disponível, considerando os DEMAIS filtros, mas NÃO o próprio. Assim,
// selecionar uma operadora não some com as outras opções (o clássico problema de facet
// que colapsa), e a lista de operadoras reflete só quem tem lote no resultado atual —
// corrigindo o filtro de operadora que antes listava todas as empresas globalmente.

export interface OperatorRef {
  slug: string;
  name: string;
}

export interface DestinationRef {
  code: string;
  name: string;
  type: string;
}

export interface FacetItem {
  operator: OperatorRef;
  destination: DestinationRef | null;
}

export type OperatorFacet = OperatorRef & { count: number };
export type DestinationFacet = DestinationRef & { count: number };

/** Mantém só os itens das operadoras escolhidas (no-op se nada escolhido). */
export function filterByOperators<T extends FacetItem>(items: T[], slugs?: string[] | null): T[] {
  if (!slugs?.length) return items;
  const set = new Set(slugs);
  return items.filter((i) => set.has(i.operator.slug));
}

/** Mantém só os itens dos destinos escolhidos (no-op se nada escolhido). */
export function filterByDestinations<T extends FacetItem>(
  items: T[],
  codes?: string[] | null,
): T[] {
  if (!codes?.length) return items;
  const set = new Set(codes);
  return items.filter((i) => i.destination != null && set.has(i.destination.code));
}

/** Operadoras distintas presentes nos itens, com contagem, ordenadas por nome. */
export function aggregateOperators(items: FacetItem[]): OperatorFacet[] {
  const map = new Map<string, OperatorFacet>();
  for (const i of items) {
    const cur = map.get(i.operator.slug);
    if (cur) cur.count++;
    else map.set(i.operator.slug, { ...i.operator, count: 1 });
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Destinos distintos presentes nos itens, com contagem, ordenados por nome. */
export function aggregateDestinations(items: FacetItem[]): DestinationFacet[] {
  const map = new Map<string, DestinationFacet>();
  for (const i of items) {
    if (!i.destination) continue;
    const cur = map.get(i.destination.code);
    if (cur) cur.count++;
    else map.set(i.destination.code, { ...i.destination, count: 1 });
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}
