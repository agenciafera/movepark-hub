import { describe, expect, it } from "vitest";
import { dedupePopularOffers, type PopularOffer } from "./api";

function offer(id: string, locationId: string, rank: number, price: number | null): PopularOffer {
  return {
    id,
    parking_type: { code: "covered", name: "Coberta" },
    location: {
      id: locationId,
      name: `Loc ${locationId}`,
      slug: locationId,
      review_avg: null,
      review_count: 0,
      rank,
      cover_image: null,
      company: { id: `c-${locationId}`, name: "Co", slug: `co-${locationId}` },
      destination: null,
      amenities: [],
    },
    price_1d: price,
    old_price_1d: null,
  };
}

describe("dedupePopularOffers", () => {
  it("1 card por estacionamento — mantém a oferta de menor preço", () => {
    const out = dedupePopularOffers(
      [offer("a1", "L1", 0, 90), offer("a2", "L1", 0, 50), offer("b1", "L2", 1, 70)],
      6,
    );
    expect(out).toHaveLength(2);
    expect(out.find((o) => o.location.id === "L1")!.id).toBe("a2"); // 50 < 90
  });

  it("ordena pelo ranking de reservas (rank asc), preço como desempate", () => {
    const out = dedupePopularOffers(
      [offer("x", "L3", 2, 10), offer("y", "L1", 0, 80), offer("z", "L2", 1, 40)],
      6,
    );
    expect(out.map((o) => o.location.id)).toEqual(["L1", "L2", "L3"]);
  });

  it("corta em `max`", () => {
    const offers = Array.from({ length: 10 }, (_, i) => offer(`o${i}`, `L${i}`, i, 100 - i));
    expect(dedupePopularOffers(offers, 6)).toHaveLength(6);
  });

  it("zero-safe: rank igual (0 reservas) cai no desempate por preço; sem ofertas → vazio", () => {
    const out = dedupePopularOffers(
      [offer("a", "L1", 0, 99), offer("b", "L2", 0, 30)],
      6,
    );
    expect(out.map((o) => o.location.id)).toEqual(["L2", "L1"]); // mesmo rank → menor preço primeiro
    expect(dedupePopularOffers([], 6)).toEqual([]);
  });
});
