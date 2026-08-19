// Facetas de busca (estacionamento + destino) e filtros correspondentes — lógica pura,
// sem dependência de Deno/Supabase, para ser testável (deno test).
//
// As facetas alimentam a sidebar de filtros: cada faceta é calculada sobre o conjunto
// já precificado/disponível, considerando os DEMAIS filtros, mas NÃO o próprio. Assim,
// selecionar um estacionamento não some com as outras opções (o clássico problema de facet
// que colapsa), e a lista de estacionamentos reflete só quem tem lote no resultado atual —
// corrigindo o filtro de estacionamento que antes listava todas as empresas globalmente.

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

/** Mantém só os itens dos estacionamentos escolhidos (no-op se nada escolhido). */
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

/** Estacionamentos distintos presentes nos itens, com contagem, ordenados por nome. */
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

export interface CategoryItem {
  company_parking_type: { parking_type: { code: string } };
}

// "avulsa" (Garageinn: vaga sem local fixo, sujeita à lotação do pátio) também aparece
// quando o cliente filtra "Descoberto" — a unidade não garante cobertura, então entra
// nesse filtro por decisão de produto, sem precisar de pill própria pro cliente escolher.
// O code no catálogo continua distinto: é o que permite editar e filtrar os dois tipos
// em separado no admin. Ver supabase/migrations/20260819203903_vaga_avulsa_parking_type.sql.
const CATEGORY_FILTER_ALIASES: Record<string, string[]> = {
  uncovered: ["avulsa"],
};

/** Mantém só os itens cujo tipo de vaga bate com os codes escolhidos (no-op se nada
 * escolhido), expandindo as equivalências de CATEGORY_FILTER_ALIASES. */
export function filterByCategory<T extends CategoryItem>(items: T[], codes?: string[] | null): T[] {
  if (!codes?.length) return items;
  const set = new Set(codes.flatMap((c) => [c, ...(CATEGORY_FILTER_ALIASES[c] ?? [])]));
  return items.filter((i) => set.has(i.company_parking_type.parking_type.code));
}
