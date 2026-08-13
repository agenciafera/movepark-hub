import { describe, expect, it } from "vitest";

import { buildStaticUnits, type ProximityRow, type UnitRow } from "./units.logic";

function regra(tiers: { from_day: number; to_day: number | null; unit_price: number }[]) {
  return {
    strategy: "uniform_by_duration",
    incremental_one_day_price: null,
    old_price_strategy: "none",
    old_price_multiplier: null,
    hourly_daily_rate: null,
    pricing_tier: tiers.map((t) => ({
      from_day: t.from_day,
      to_day: t.to_day,
      total_price: null,
      unit_price: t.unit_price,
      is_old_price: false,
    })),
  };
}

function row(over: Partial<UnitRow> = {}, locOver: Record<string, unknown> = {}): UnitRow {
  return {
    id: "lpt1",
    capacity: 80,
    is_active: true,
    location: {
      id: "loc1",
      slug: "aeroporto-afonso-pena",
      name: "Aeroporto Afonso Pena",
      address: "Av. Rocha Pombo, s/n",
      latitude: "-25.53",
      longitude: "-49.17",
      review_avg: 4.6,
      review_count: 12,
      photos: ["https://x/foto1.webp", "https://x/foto2.webp"],
      is_listed: true,
      deleted_at: null,
      company: { slug: "abbapark", name: "Abbapark", status: "active" },
      amenities: [{ amenity_code: "cameras" }, { amenity_code: "transfer" }],
      ...locOver,
    } as UnitRow["location"],
    company_parking_type: { parking_type: { code: "covered", name: "Vaga Coberta" } },
    pricing_rule: regra([{ from_day: 1, to_day: null, unit_price: 30 }]),
    ...over,
  };
}

const prox: ProximityRow[] = [
  {
    location_id: "loc1",
    distance_km: "1.8",
    nearest_terminal_name: "Terminal de Passageiros",
    nearest_terminal_distance_km: "1.2",
  },
];

describe("buildStaticUnits", () => {
  it("monta o card com o que é verdade sem data", () => {
    const [item] = buildStaticUnits([row()], prox);
    expect(item.id).toBe("lpt1");
    expect(item.operator).toEqual({ slug: "abbapark", name: "Abbapark" });
    expect(item.parking_type).toEqual({ code: "covered", name: "Vaga Coberta" });
    expect(item.location.cover_image).toBe("https://x/foto1.webp");
    expect(item.amenities).toEqual(["cameras", "transfer"]);
    expect(item.price.per_day).toBe(30);
  });

  it("converte numeric do Postgres, que chega como string", () => {
    const [item] = buildStaticUnits([row()], prox);
    expect(item.location.latitude).toBe(-25.53);
    expect(item.location.distance_km).toBe(1.8);
    expect(item.location.nearest_terminal).toEqual({
      name: "Terminal de Passageiros",
      distance_km: 1.2,
    });
  });

  it("disponibilidade nasce neutra, porque HTML congelado não pode afirmar vaga", () => {
    // O ponto do arquivo inteiro: "resta 1 vaga" gravado no build vira mentira na hora
    // seguinte, e ADR-009 proíbe renderizar promessa que a unidade não sustenta.
    const [item] = buildStaticUnits([row()], prox);
    expect(item.availability).toEqual({
      remaining: null,
      sold_out: false,
      near_capacity: false,
      near_capacity_message: null,
    });
    expect(item.location.high_demand_today).toBe(false);
  });

  it("quem só vende estadia longa entra com o preço da menor estadia que vende", () => {
    // Abbapark e Nationpark em Afonso Pena começam a tabela em 3 diárias. Sem isso eles
    // sumiam da vitrine inteira, sem nada indicando o motivo.
    const [item] = buildStaticUnits(
      [row({ pricing_rule: regra([{ from_day: 3, to_day: null, unit_price: 23.9 }]) })],
      prox,
    );
    expect(item.price.days).toBe(3);
    expect(item.min_stay_days).toBe(3);
    expect(item.price.total).toBe(71.7);
    expect(item.price.per_day).toBe(23.9);
  });

  it("estadia de 1 diária não anuncia mínimo", () => {
    const [item] = buildStaticUnits([row()], prox);
    expect(item.price.days).toBe(1);
    expect(item.min_stay_days).toBeNull();
  });

  it("descarta o que não pode aparecer na vitrine", () => {
    const casos: [string, UnitRow][] = [
      ["sem preço calculável", row({ pricing_rule: null })],
      ["tipo de vaga inativo", row({ is_active: false })],
      ["unidade não listada", row({}, { is_listed: false })],
      ["unidade com soft delete", row({}, { deleted_at: "2026-01-01T00:00:00Z" })],
      ["empresa inativa", row({}, { company: { slug: "x", name: "X", status: "inactive" } })],
      ["empresa que a RLS não liberou", row({}, { company: null })],
      ["tipo de vaga ausente no embed", row({ company_parking_type: null })],
    ];
    for (const [motivo, r] of casos) {
      expect(buildStaticUnits([r], prox), motivo).toEqual([]);
    }
  });

  it("ordena por preço da diária, igual ao sort que a página pede à busca", () => {
    // Se a ordem da semente divergir do price_asc da busca, os cards trocam de lugar na
    // frente de quem está lendo assim que a busca do cliente responde.
    const itens = buildStaticUnits(
      [
        row({ id: "caro", pricing_rule: regra([{ from_day: 1, to_day: null, unit_price: 40 }]) }),
        row({ id: "barato", pricing_rule: regra([{ from_day: 1, to_day: null, unit_price: 20 }]) }),
        row({ id: "meio", pricing_rule: regra([{ from_day: 1, to_day: null, unit_price: 30 }]) }),
      ],
      prox,
    );
    expect(itens.map((i) => i.id)).toEqual(["barato", "meio", "caro"]);
  });

  it("sem geo do destino o card sai sem distância, em vez de sair errado", () => {
    const [item] = buildStaticUnits([row()], []);
    expect(item.location.distance_km).toBeNull();
    expect(item.location.nearest_terminal).toBeNull();
  });

  it("terminal só aparece com nome e distância juntos", () => {
    const [item] = buildStaticUnits([row()], [
      { location_id: "loc1", distance_km: "2", nearest_terminal_name: "T1", nearest_terminal_distance_km: null },
    ]);
    expect(item.location.nearest_terminal).toBeNull();
    expect(item.location.distance_km).toBe(2);
  });

  it("unidade sem foto sai com capa nula em vez de quebrar", () => {
    const [item] = buildStaticUnits([row({}, { photos: null })], prox);
    expect(item.location.cover_image).toBeNull();
  });
});
