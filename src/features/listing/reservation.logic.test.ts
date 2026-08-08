import { describe, expect, it } from "vitest";
import {
  addOnsTotal,
  bookingTotal,
  mergeUnitFares,
  selectedAddOns,
  type AddOnOption,
  perDayPrice,
  counterSavings,
} from "./reservation.logic";

const OPTS: AddOnOption[] = [
  { id: "a", name: "Lava-jato", description: null, price: 30 },
  { id: "b", name: "Enceramento", description: null, price: 20 },
  { id: "c", name: "Detalhe", description: null, price: 50 },
];

describe("selectedAddOns", () => {
  it("filtra preservando a ordem do catálogo", () => {
    expect(selectedAddOns(OPTS, ["c", "a"]).map((o) => o.id)).toEqual(["a", "c"]);
  });
  it("vazio quando nada selecionado", () => {
    expect(selectedAddOns(OPTS, [])).toEqual([]);
  });
});

describe("addOnsTotal", () => {
  it("soma os selecionados", () => {
    expect(addOnsTotal(OPTS, ["a", "b"])).toBe(50);
  });
  it("ignora ids inexistentes", () => {
    expect(addOnsTotal(OPTS, ["a", "x"])).toBe(30);
  });
});

describe("bookingTotal", () => {
  it("desconto incide só no estacionamento; add-ons por cima", () => {
    expect(bookingTotal(100, 10, 50)).toBe(140);
  });
  it("desconto não deixa o estacionamento negativo", () => {
    expect(bookingTotal(30, 50, 20)).toBe(20);
  });
  it("sem desconto nem add-ons retorna o preço", () => {
    expect(bookingTotal(80, 0, 0)).toBe(80);
  });
  it("soma a Tarifa (E2.8) por cima", () => {
    expect(bookingTotal(100, 10, 50, 12.9)).toBe(152.9);
    expect(bookingTotal(80, 0, 0, 24.9)).toBe(104.9);
    expect(bookingTotal(80, 0, 0)).toBe(80); // sem tarifa = comportamento antigo
  });
});

describe("mergeUnitFares", () => {
  const FARES = [
    { id: "basic", surcharge: 0, tagline: "Grátis" },
    { id: "flex", surcharge: 12.9, tagline: "+ R$ 12,90" },
    { id: "superflex", surcharge: 24.9, tagline: "+ R$ 24,90" },
  ];
  const fmt = { reais: (c: number) => c / 100, brl: (r: number) => `R$ ${r.toFixed(2)}` };

  it("sem dados da unidade devolve os defaults intactos", () => {
    expect(mergeUnitFares(FARES, [], fmt)).toEqual(FARES);
  });

  it("sobrescreve com o preço efetivo da unidade (override por unidade)", () => {
    const out = mergeUnitFares(
      FARES,
      [
        { tier: "basica", price_cents: 0 },
        { tier: "flex", price_cents: 1500 },
        { tier: "superflex", price_cents: 2490 },
      ],
      fmt,
    );
    expect(out.map((f) => f.surcharge)).toEqual([0, 15, 24.9]);
    expect(out.find((f) => f.id === "flex")?.tagline).toBe("+ R$ 15.00");
    expect(out.find((f) => f.id === "basic")?.tagline).toBe("Grátis");
  });

  it("descarta tiers desativados na unidade e mapeia basic↔basica", () => {
    const out = mergeUnitFares(
      FARES,
      [
        { tier: "basica", price_cents: 0 },
        { tier: "flex", price_cents: 1290 },
      ],
      fmt,
    );
    expect(out.map((f) => f.id)).toEqual(["basic", "flex"]);
  });
});

describe("perDayPrice", () => {
  it("divide o total pelas diárias, que é o que o rótulo promete", () => {
    // Regressão do bug visto na single do Virapark: o card mostrava R$ 224,10 com o sufixo
    // "/ diária", quando esse era o total de 9 diárias. Valia para toda unidade.
    expect(perDayPrice(224.1, 9)).toBeCloseTo(24.9, 2);
  });

  it("uma diária é o próprio valor", () => {
    expect(perDayPrice(40, 1)).toBe(40);
  });

  it("sem datas escolhidas não divide por zero", () => {
    expect(perDayPrice(40, 0)).toBe(40);
  });

  it("divisão que não fecha ao centavo devolve a fração, sem arredondar por conta própria", () => {
    // Quem arredonda é o formatBRL na hora de mostrar; a conta aqui fica exata para o
    // arredondamento acontecer uma vez só.
    expect(perDayPrice(100, 3)).toBeCloseTo(33.3333, 3);
  });
});

describe("counterSavings", () => {
  it("calcula a economia contra o balcão", () => {
    // Virapark, 9 diárias: balcão 9 x 40 = 360, online 224,10.
    expect(counterSavings(360, 224.1)).toBeCloseTo(135.9, 2);
  });

  it("sem balcão não inventa economia", () => {
    // 50 das 58 regras têm old_price_strategy = 'none'. Riscado sem lastro é âncora falsa.
    expect(counterSavings(null, 224.1)).toBeNull();
    expect(counterSavings(undefined, 224.1)).toBeNull();
  });

  it("balcão igual ou menor não vira economia", () => {
    expect(counterSavings(224.1, 224.1)).toBeNull();
    expect(counterSavings(200, 224.1)).toBeNull();
  });

  it("compara com o que a pessoa paga, tarifa incluída", () => {
    // Tarifa Flex de 12,90 encolhe a economia anunciada, e tem que encolher mesmo: o número
    // precisa sobreviver ao total da tela.
    expect(counterSavings(360, 224.1 + 12.9)).toBeCloseTo(123, 2);
  });
});
