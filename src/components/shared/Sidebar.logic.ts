// Lógica pura da navegação (itens, seções e filtro por escopo, ADR-005). Sem React → testável.

export type NavItem<I> = {
  to: string;
  label: string;
  /** Rótulo curto para a barra inferior do mobile. Cai no `label` quando ausente. */
  shortLabel?: string;
  icon: I;
  /** Escopo exigido pra exibir o item (ADR-005). Ausente = visível a todos os membros. */
  scope?: string;
};

/** Grupo de itens com um título curto. `title` ausente = grupo sem cabeçalho. */
export type NavSection<I> = {
  title?: string;
  items: NavItem<I>[];
};

/**
 * Filtra os itens de navegação pelos escopos do usuário. Itens sem `scope` sempre
 * aparecem (a ação dentro da página é que é gateada). Itens com `scope` só aparecem se
 * `hasScope(scope)` for verdadeiro: mesma fonte de verdade do gate de rota.
 */
export function filterNavByScopes<I>(
  items: NavItem<I>[],
  hasScope: (scope: string) => boolean,
): NavItem<I>[] {
  return items.filter((item) => !item.scope || hasScope(item.scope));
}

/** Mesma regra de escopo, agora por seção. Seções que ficam vazias somem. */
export function filterSectionsByScopes<I>(
  sections: NavSection<I>[],
  hasScope: (scope: string) => boolean,
): NavSection<I>[] {
  return sections
    .map((section) => ({ ...section, items: filterNavByScopes(section.items, hasScope) }))
    .filter((section) => section.items.length > 0);
}

/** Todos os itens visíveis, na ordem das seções. */
export function flattenSections<I>(sections: NavSection<I>[]): NavItem<I>[] {
  return sections.flatMap((section) => section.items);
}

/**
 * Monta a barra inferior do mobile: até `maxPrimary` destinos diretos (escolhidos por `primaryPaths`,
 * na ordem em que aparecem lá) e o resto no menu "Mais", agrupado igual à sidebar. Tudo já filtrado
 * por escopo, então nenhum item permitido fica inalcançável no celular.
 */
export function buildBottomNav<I>(
  sections: NavSection<I>[],
  hasScope: (scope: string) => boolean,
  primaryPaths: string[],
  maxPrimary = 4,
): { primary: NavItem<I>[]; more: NavSection<I>[] } {
  const visible = filterSectionsByScopes(sections, hasScope);
  const all = flattenSections(visible);

  const primary = primaryPaths
    .map((path) => all.find((item) => item.to === path))
    .filter((item): item is NavItem<I> => !!item)
    .slice(0, maxPrimary);

  const inPrimary = new Set(primary.map((item) => item.to));
  const more = visible
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !inPrimary.has(item.to)),
    }))
    .filter((section) => section.items.length > 0);

  return { primary, more };
}
