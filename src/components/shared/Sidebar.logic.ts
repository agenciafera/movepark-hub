// Lógica pura da navegação (itens, seções e filtro por escopo, ADR-005). Sem React → testável.

export type NavItem<I> = {
  to: string;
  label: string;
  /** Rótulo curto para a barra inferior do mobile. Cai no `label` quando ausente. */
  shortLabel?: string;
  icon: I;
  /** Escopo exigido pra exibir o item (ADR-005). Ausente = visível a todos os membros. */
  scope?: string;
  /**
   * Subitens. Quando presente, o item vira um grupo que abre e fecha na sidebar, e o `to` dele é
   * só o destino padrão (o primeiro filho), não um link próprio.
   *
   * Existe para uma área com várias telas ocupar uma linha do menu em vez de quatro. Um nível só:
   * filho de filho viraria árvore, e menu que precisa de árvore é menu que precisa de menos itens.
   */
  children?: NavItem<I>[];
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
  return items
    .filter((item) => !item.scope || hasScope(item.scope))
    .map((item) =>
      item.children ? { ...item, children: filterNavByScopes(item.children, hasScope) } : item,
    )
    // Grupo que perdeu todos os filhos por escopo some junto: um pai sozinho abriria para nada.
    .filter((item) => !item.children || item.children.length > 0);
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

/**
 * Todos os destinos visíveis, na ordem das seções, com os subitens no lugar do pai.
 *
 * O pai de um grupo não entra: ele não é destino, é uma gaveta. Quem entra são os filhos, senão
 * uma página permitida ficaria inalcançável no celular, que é justamente o que a barra inferior
 * existe para evitar.
 */
export function flattenSections<I>(sections: NavSection<I>[]): NavItem<I>[] {
  return sections.flatMap((section) =>
    section.items.flatMap((item) => (item.children?.length ? item.children : [item])),
  );
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

  // O menu "Mais" é uma lista, não uma árvore: o grupo vira uma seção própria, com o rótulo do
  // pai como título. Repetir a gaveta num sheet que já rola seria um clique a mais para nada.
  const inPrimary = new Set(primary.map((item) => item.to));
  const more = visible
    .flatMap((section) => {
      const soltos = section.items.filter((item) => !item.children?.length);
      const grupos = section.items.filter((item) => !!item.children?.length);
      return [
        { ...section, items: soltos },
        ...grupos.map((grupo) => ({ title: grupo.label, items: grupo.children ?? [] })),
      ];
    })
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !inPrimary.has(item.to)),
    }))
    .filter((section) => section.items.length > 0);

  return { primary, more };
}
