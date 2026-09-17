import { describe, expect, it } from "vitest";

import { PRICE_INDEX_VERSION, buildPriceIndexJson } from "./price-index-json.mjs";

const SITE = "https://movepark.co";
const urlDestino = (d) => `/estacionamentos/${d.public_slug ?? d.slug}`;
const urlPrecos = (d) => `${urlDestino(d)}/precos`;

/** Um destino precificado com duas vagas, uma de carro e uma de moto. */
function priceIndexFake() {
  return {
    days: [1, 7],
    destinations: [
      {
        slug: "aeroporto-internacional-de-sao-paulo-guarulhos",
        public_slug: "aeroporto-guarulhos",
        code: "GRU",
        name: "Aeroporto Internacional de São Paulo/Guarulhos",
        short_name: "Guarulhos (GRU)",
        type: "airport",
        city: "Guarulhos",
        state: "SP",
        units: [
          {
            company_slug: "aeropark",
            company_name: "Aeropark",
            location_slug: "aeroporto-guarulhos",
            location_name: "Aeroporto de Guarulhos",
            location_public_name: "Aeropark - Estacionamento Guarulhos",
            parking_type_code: "covered",
            parking_type_name: "Vaga Coberta",
            public_path: "/estacionamentos/aeroporto-guarulhos/aeropark",
            checkout_mode: "internal",
            distance_m: 1200,
            has_shuttle: true,
            shuttle_minutes: 7,
            review_avg: 4.8,
            review_count: 12,
            min_stay_days: null,
            price_updated_at: "2026-09-10T12:00:00+00:00",
            prices: [
              { days: 1, total: 30, old_total: 40 },
              { days: 7, total: 140, old_total: 140 },
            ],
          },
          {
            company_slug: "aerovalet",
            company_name: "Aerovalet",
            location_slug: "aeroporto-guarulhos",
            location_name: "Aeroporto de Guarulhos",
            location_public_name: "Aerovalet - Guarulhos",
            parking_type_code: "motorcycle",
            parking_type_name: "Vaga Moto",
            public_path: "/estacionamentos/aeroporto-guarulhos/aerovalet",
            checkout_mode: "external",
            distance_m: 4549,
            has_shuttle: false,
            shuttle_minutes: null,
            review_avg: null,
            review_count: 0,
            min_stay_days: 3,
            price_updated_at: "2026-09-16T04:02:06+00:00",
            prices: [
              { days: 1, total: null, old_total: null },
              { days: 7, total: 70, old_total: null },
            ],
          },
        ],
      },
    ],
  };
}

const catalogo = [
  {
    slug: "aeroporto-internacional-de-sao-paulo-guarulhos",
    public_slug: "aeroporto-guarulhos",
    code: "GRU",
    name: "Aeroporto Internacional de São Paulo/Guarulhos",
    type: "airport",
    city: "Guarulhos",
    state: "SP",
  },
  {
    slug: "aeroporto-de-recife",
    public_slug: "aeroporto-recife",
    code: "REC",
    name: "Aeroporto do Recife",
    type: "airport",
    city: "Recife",
    state: "PE",
  },
];

function build(extra = {}) {
  return buildPriceIndexJson({
    priceIndex: priceIndexFake(),
    destinations: catalogo,
    siteUrl: SITE,
    generatedAt: "2026-09-16T10:00:00.000Z",
    urlDestino,
    urlPrecos,
    ...extra,
  });
}

describe("buildPriceIndexJson", () => {
  it("datar o índice não é opcional: versão, data do build e durações no topo", () => {
    const j = build();
    expect(j.version).toBe(PRICE_INDEX_VERSION);
    expect(j.generated_at).toBe("2026-09-16T10:00:00.000Z");
    expect(j.days).toEqual([1, 7]);
    expect(j.currency).toBe("BRL");
    expect(j.scope).toBe("all");
    expect(j.attribution).toContain("movepark.co");
    // A mesma licença do `Dataset` (JSON-LD) da página /precos.
    expect(j.license).toBe("https://creativecommons.org/licenses/by/4.0/");
  });

  it("cada unidade carrega a data da própria tabela, que é o desempate entre fontes", () => {
    const [dest] = build().destinations;
    expect(dest.units.map((u) => u.price_updated_at)).toEqual([
      "2026-09-10T12:00:00+00:00",
      "2026-09-16T04:02:06+00:00",
    ]);
  });

  it("usa o slug público e monta URL absoluta do destino, da tabela e do JSON", () => {
    const [dest] = build().destinations;
    expect(dest.slug).toBe("aeroporto-guarulhos");
    expect(dest.url).toBe(`${SITE}/estacionamentos/aeroporto-guarulhos`);
    expect(dest.prices_url).toBe(`${SITE}/estacionamentos/aeroporto-guarulhos/precos`);
    expect(dest.prices_json_url).toBe(`${SITE}/estacionamentos/aeroporto-guarulhos/precos.json`);
    expect(dest.units[0].url).toBe(`${SITE}/estacionamentos/aeroporto-guarulhos/aeropark`);
  });

  it("balcão só quando é maior que o online", () => {
    const [dest] = build().destinations;
    const [umaDiaria, seteDiarias] = dest.units[0].prices;
    expect(umaDiaria.old_total).toBe(40);
    // 140 contra 140 não é economia, então não vira balcão.
    expect(seteDiarias.old_total).toBeNull();
  });

  it("calcula o preço por diária e preserva o null de quem está abaixo do piso de estadia", () => {
    const [dest] = build().destinations;
    expect(dest.units[0].prices[1].per_day).toBe(20);
    const moto = dest.units[1];
    expect(moto.min_stay_days).toBe(3);
    expect(moto.prices[0]).toMatchObject({ days: 1, total: null, per_day: null });
  });

  it("moto entra em units e fica fora do mais barato", () => {
    const [dest] = build().destinations;
    expect(dest.units.map((u) => u.parking_type_code)).toContain("motorcycle");
    // A vaga de moto de 7 diárias custa 70 e a de carro 140: sem o corte, ela venceria.
    expect(dest.cheapest).toEqual([
      {
        days: 1,
        total: 30,
        per_day: 30,
        company_name: "Aeropark",
        parking_type_name: "Vaga Coberta",
        url: `${SITE}/estacionamentos/aeroporto-guarulhos/aeropark`,
      },
      {
        days: 7,
        total: 140,
        per_day: 20,
        company_name: "Aeropark",
        parking_type_name: "Vaga Coberta",
        url: `${SITE}/estacionamentos/aeroporto-guarulhos/aeropark`,
      },
    ]);
  });

  it("conta destinos, locais e vagas do próprio recorte", () => {
    expect(build().counts).toEqual({ destinations: 1, locations: 2, units: 2 });
  });

  it("declara a cobertura sem reserva online no índice completo", () => {
    const j = build();
    expect(j.destinations_without_online_booking).toEqual([
      {
        slug: "aeroporto-recife",
        code: "REC",
        name: "Aeroporto do Recife",
        type: "airport",
        city: "Recife",
        state: "PE",
        url: `${SITE}/estacionamentos/aeroporto-recife`,
      },
    ]);
  });

  it("recorte por destino traz só ele, com as URLs dele e sem a lista de cobertura", () => {
    const j = build({ scope: "aeroporto-guarulhos" });
    expect(j.scope).toBe("aeroporto-guarulhos");
    expect(j.destinations).toHaveLength(1);
    expect(j.html_url).toBe(`${SITE}/estacionamentos/aeroporto-guarulhos/precos`);
    expect(j.markdown_url).toBe(`${SITE}/estacionamentos/aeroporto-guarulhos/precos.md`);
    expect(j.destinations_without_online_booking).toBeUndefined();
  });

  it("índice vazio não quebra nem inventa número", () => {
    const j = buildPriceIndexJson({
      priceIndex: null,
      destinations: [],
      siteUrl: SITE,
      generatedAt: "2026-09-16T10:00:00.000Z",
      urlDestino,
      urlPrecos,
    });
    expect(j.days).toEqual([1, 7, 15, 30]);
    expect(j.destinations).toEqual([]);
    expect(j.counts).toEqual({ destinations: 0, locations: 0, units: 0 });
    expect(j.html_url).toBe(`${SITE}/precos`);
  });
});
