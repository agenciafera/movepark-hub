import { describe, expect, it } from "vitest";
import { dedupePopularOffers, type PopularOffer } from "./api";

/** `rank` vem da RPC popular_parking_types já ordenada por venda (0 = mais vendido). */
function offer(
  id: string,
  companyId: string,
  rank: number,
  opts: { locationId?: string; typeCode?: string } = {},
): PopularOffer {
  const locationId = opts.locationId ?? `L-${id}`;
  return {
    id,
    parking_type: { code: opts.typeCode ?? "covered", name: "Coberta" },
    location: {
      id: locationId,
      name: `Loc ${locationId}`,
      slug: locationId,
      review_avg: null,
      review_count: 0,
      rank,
      cover_image: null,
      company: { id: companyId, name: `Co ${companyId}`, slug: companyId },
      destination: null,
      amenities: [],
    },
    price_1d: 100,
    old_price_1d: null,
  };
}

describe("dedupePopularOffers", () => {
  it("teto de 1 por EMPRESA — guarda o tipo mais vendido (menor rank) da empresa", () => {
    // Empresa A tem dois tipos: rank 0 (mais vendido) e rank 3.
    const out = dedupePopularOffers(
      [
        offer("a-cara", "A", 3, { typeCode: "premium" }),
        offer("a-vendida", "A", 0, { typeCode: "uncovered" }),
        offer("b", "B", 1),
      ],
      6,
    );
    expect(out).toHaveLength(2);
    expect(out.find((o) => o.location.company.id === "A")!.id).toBe("a-vendida");
  });

  it("teto por empresa vale entre UNIDADES diferentes da mesma empresa (caso Aerovalet, C-01a)", () => {
    // Duas unidades da mesma empresa entram no top; só a de melhor rank fica.
    const out = dedupePopularOffers(
      [
        offer("u1", "aerovalet", 5, { locationId: "unidade-1" }),
        offer("u2", "aerovalet", 6, { locationId: "unidade-2" }),
      ],
      6,
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("u1"); // rank 5 < 6
  });

  it("ordena pelo rank de venda (asc)", () => {
    const out = dedupePopularOffers(
      [offer("x", "C", 2), offer("y", "A", 0), offer("z", "B", 1)],
      6,
    );
    expect(out.map((o) => o.location.company.id)).toEqual(["A", "B", "C"]);
  });

  it("corta em `max`", () => {
    const offers = Array.from({ length: 10 }, (_, i) => offer(`o${i}`, `C${i}`, i));
    expect(dedupePopularOffers(offers, 6)).toHaveLength(6);
  });

  it("sem ofertas → vazio", () => {
    expect(dedupePopularOffers([], 6)).toEqual([]);
  });
});
