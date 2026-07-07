import { describe, expect, it } from "vitest";
import { computeResultBadges, type SearchBadgeKind } from "./searchBadges";
import type { SearchResultItem } from "./useSearchResults";

function item(overrides: {
  id?: string;
  price?: number;
  distance?: number | null;
  terminal?: { name: string; distance_km: number } | null;
  typeCode?: string;
  amenities?: string[];
  soldOut?: boolean;
}): SearchResultItem {
  return {
    id: overrides.id ?? "lpt-1",
    operator: { slug: "op", name: "Operador" },
    location: {
      id: "loc-1",
      slug: "loc",
      name: "Local",
      address: null,
      latitude: null,
      longitude: null,
      distance_km: overrides.distance === undefined ? null : overrides.distance,
      nearest_terminal: overrides.terminal ?? null,
      review_avg: null,
      review_count: 0,
      cover_image: null,
      high_demand_today: false,
    },
    parking_type: { code: overrides.typeCode ?? "self_park", name: "Vaga" },
    capacity: 10,
    availability: {
      remaining: overrides.soldOut ? 0 : 10,
      sold_out: overrides.soldOut ?? false,
      near_capacity: false,
      near_capacity_message: null,
    },
    price: { total: overrides.price ?? 100, old_price: null, per_day: 20, days: 5 },
    amenities: overrides.amenities ?? [],
  };
}

const kinds = (item: SearchResultItem, all: SearchResultItem[]): SearchBadgeKind[] =>
  computeResultBadges(item, all).map((b) => b.kind);

describe("computeResultBadges", () => {
  it("marca o lote mais barato do conjunto", () => {
    const cheap = item({ id: "a", price: 80 });
    const mid = item({ id: "b", price: 120 });
    const all = [cheap, mid];
    expect(kinds(cheap, all)).toContain("cheapest");
    expect(kinds(mid, all)).not.toContain("cheapest");
  });

  it("marca o lote mais perto do conjunto", () => {
    const near = item({ id: "a", distance: 1.2 });
    const far = item({ id: "b", distance: 4.8 });
    const all = [near, far];
    expect(kinds(near, all)).toContain("closest");
    expect(kinds(far, all)).not.toContain("closest");
  });

  it("usa a distância ao terminal mais próximo como fallback e rotula com o terminal", () => {
    const near = item({ id: "a", distance: null, terminal: { name: "Terminal 2", distance_km: 0.4 } });
    const far = item({ id: "b", distance: null, terminal: { name: "Terminal 1", distance_km: 3.0 } });
    const badges = computeResultBadges(near, [near, far]);
    const closest = badges.find((b) => b.kind === "closest");
    expect(closest?.label).toBe("Mais perto do Terminal 2");
  });

  it("não dá comparativo quando não há variação (todos com mesmo preço/distância)", () => {
    const a = item({ id: "a", price: 100, distance: 2 });
    const b = item({ id: "b", price: 100, distance: 2 });
    expect(kinds(a, [a, b])).toEqual([]);
  });

  it("não dá comparativo com um único resultado", () => {
    const only = item({ id: "a", price: 100, distance: 1 });
    expect(kinds(only, [only])).toEqual([]);
  });

  it("ignora esgotados no universo comparável e não dá badge a esgotado", () => {
    const soldOutCheapest = item({ id: "a", price: 50, soldOut: true });
    const available = item({ id: "b", price: 90 });
    const otherAvailable = item({ id: "c", price: 150 });
    const all = [soldOutCheapest, available, otherAvailable];
    // esgotado não recebe badge
    expect(kinds(soldOutCheapest, all)).toEqual([]);
    // o mais barato entre os disponíveis ganha, mesmo havendo um esgotado mais barato
    expect(kinds(available, all)).toContain("cheapest");
  });

  it("deriva atributos de parking_type e amenidades", () => {
    const shuttleCovered = item({
      id: "a",
      typeCode: "covered",
      amenities: ["shuttle_free", "valet"],
    });
    const k = kinds(shuttleCovered, [shuttleCovered, item({ id: "b" })]);
    expect(k).toContain("shuttle");
  });

  it("limita a no máximo 2 badges, priorizando comparativos", () => {
    const cheap = item({
      id: "a",
      price: 60,
      distance: 0.5,
      typeCode: "covered",
      amenities: ["shuttle_free", "valet", "covered"],
    });
    const other = item({ id: "b", price: 200, distance: 5 });
    const badges = computeResultBadges(cheap, [cheap, other]);
    expect(badges).toHaveLength(2);
    expect(badges.map((b) => b.kind)).toEqual(["cheapest", "closest"]);
  });
});
