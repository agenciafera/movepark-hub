import { describe, expect, it } from "vitest";
import { groupFaqsByScope } from "./FaqList.logic";
import type { FaqCombinedItem } from "./api";

function item(scope: FaqCombinedItem["scope"], id: string): FaqCombinedItem {
  return {
    id,
    scope,
    location_id: scope === "location" || scope === "auto" ? "loc" : null,
    destination_id: scope === "destination" ? "dest" : null,
    question: `q-${id}`,
    answer: `a-${id}`,
    sort_order: 0,
    category: null,
  };
}

describe("groupFaqsByScope (ADR-002 — FAQ em camadas)", () => {
  it("separa unidade (location+auto), destino e geral", () => {
    const groups = groupFaqsByScope([
      item("auto", "1"),
      item("location", "2"),
      item("destination", "3"),
      item("global", "4"),
    ]);
    expect(groups.location.map((i) => i.id)).toEqual(["1", "2"]);
    expect(groups.destination.map((i) => i.id)).toEqual(["3"]);
    expect(groups.global.map((i) => i.id)).toEqual(["4"]);
  });

  it("preserva a ordem de entrada dentro de cada grupo", () => {
    const groups = groupFaqsByScope([
      item("global", "g1"),
      item("destination", "d1"),
      item("global", "g2"),
      item("destination", "d2"),
    ]);
    expect(groups.global.map((i) => i.id)).toEqual(["g1", "g2"]);
    expect(groups.destination.map((i) => i.id)).toEqual(["d1", "d2"]);
  });

  it("lida com listas sem destino (retrocompatível)", () => {
    const groups = groupFaqsByScope([item("auto", "1"), item("global", "2")]);
    expect(groups.destination).toEqual([]);
    expect(groups.location).toHaveLength(1);
    expect(groups.global).toHaveLength(1);
  });
});
