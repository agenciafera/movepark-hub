// Lógica pura do filtro de navegação por escopo (ADR-005). Sem React → testável.

export type NavItem<I> = {
  to: string;
  label: string;
  icon: I;
  /** Escopo exigido pra exibir o item (ADR-005). Ausente = visível a todos os membros. */
  scope?: string;
};

/**
 * Filtra os itens de navegação pelos escopos do usuário. Itens sem `scope` sempre
 * aparecem (a ação dentro da página é que é gateada). Itens com `scope` só aparecem se
 * `hasScope(scope)` for verdadeiro — mesma fonte de verdade do gate de rota.
 */
export function filterNavByScopes<I>(
  items: NavItem<I>[],
  hasScope: (scope: string) => boolean,
): NavItem<I>[] {
  return items.filter((item) => !item.scope || hasScope(item.scope));
}
