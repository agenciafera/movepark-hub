import type { FaqCombinedItem } from "./api";

/**
 * Agrupa a FAQ combinada por camada (ADR-002), para render com títulos.
 * - `location`: o que é da unidade (auto + location)
 * - `destination`: o que é do aeroporto/destino
 * - `global`: perguntas gerais da Movepark
 * Preserva a ordem de entrada dentro de cada grupo (já vem ordenada do edge).
 */
export type FaqGroups = {
  location: FaqCombinedItem[];
  destination: FaqCombinedItem[];
  global: FaqCombinedItem[];
};

export function groupFaqsByScope(items: FaqCombinedItem[]): FaqGroups {
  const groups: FaqGroups = { location: [], destination: [], global: [] };
  for (const it of items) {
    if (it.scope === "location" || it.scope === "auto") groups.location.push(it);
    else if (it.scope === "destination") groups.destination.push(it);
    else groups.global.push(it);
  }
  return groups;
}
