import { describe, expect, it } from "vitest";
import {
  extraDaysRows,
  parseExtraDaysTable,
  pricingDays,
  quoteExit,
  type ExtraDaysTable,
} from "./extraDays.logic";

// MP-B59849 (Pare Seguro, vaga descoberta): 8 diárias por R$ 151,20, pacote de 15 a 30 dias por
// R$ 290,00. Valores tirados da tabela da compra no banco vivo em 26/11/2026.
const raw = {
  booking_id: "b1",
  booked_days: 8,
  tolerance_minutes: 60,
  check_in_at: "2026-12-10T07:30:00+00:00",
  check_out_at: "2026-12-18T01:30:00+00:00",
  price_source: "compra",
  prices: {
    "8": 151.2,
    "9": 170.1,
    "10": 189.0,
    "11": 207.9,
    "12": 226.8,
    "13": 245.7,
    "14": 264.6,
    "15": 290,
    "16": 290,
    "17": null,
  },
};

const tabela = parseExtraDaysTable(raw) as ExtraDaysTable;

describe("parseExtraDaysTable", () => {
  it("lê a resposta da RPC", () => {
    expect(tabela.bookedDays).toBe(8);
    expect(tabela.toleranceMinutes).toBe(60);
    expect(tabela.source).toBe("compra");
    expect(tabela.prices.get(9)).toBe(170.1);
    expect(tabela.prices.get(17)).toBeNull();
    expect(tabela.lastDay).toBe(17);
  });

  it("sem fonte ou sem preço da estadia reservada, não há tabela", () => {
    expect(parseExtraDaysTable({ ...raw, price_source: null, prices: {} })).toBeNull();
    expect(parseExtraDaysTable(null)).toBeNull();
    expect(parseExtraDaysTable({ ...raw, prices: { "9": 170.1 } })).toBeNull();
  });
});

describe("pricingDays", () => {
  it("conta blocos de 24h a partir da entrada, como a criação da reserva", () => {
    expect(pricingDays("2026-12-10T10:00:00Z", "2026-12-13T10:00:00Z", 0)).toBe(3);
    expect(pricingDays("2026-12-10T10:00:00Z", "2026-12-13T10:01:00Z", 0)).toBe(4);
  });

  it("a tolerância da unidade segura a diária seguinte", () => {
    expect(pricingDays("2026-12-10T10:00:00Z", "2026-12-13T10:59:00Z", 60)).toBe(3);
    expect(pricingDays("2026-12-10T10:00:00Z", "2026-12-13T11:01:00Z", 60)).toBe(4);
  });

  it("nunca dá menos de uma diária", () => {
    expect(pricingDays("2026-12-10T10:00:00Z", "2026-12-10T10:20:00Z", 60)).toBe(1);
  });
});

describe("extraDaysRows", () => {
  it("a primeira linha é a estadia reservada e as seguintes dizem quanto cobrar a mais", () => {
    const rows = extraDaysRows(tabela, 3);
    expect(rows.map((r) => [r.extra, r.days, r.total, r.charge])).toEqual([
      [0, 8, 151.2, null],
      [1, 9, 170.1, 18.9],
      [2, 10, 189, 37.8],
      [3, 11, 207.9, 56.7],
    ]);
  });

  it("segue a tabela: o pacote de 15 dias custa mais que 14, e o 16º dia não custa nada", () => {
    const rows = extraDaysRows(tabela, 8);
    expect(rows[6]).toMatchObject({ days: 14, charge: 113.4 });
    expect(rows[7]).toMatchObject({ days: 15, charge: 138.8 });
    expect(rows[8]).toMatchObject({ days: 16, charge: 138.8 });
  });

  it("para onde a tabela acaba e mostra a duração sem preço como vazia", () => {
    const rows = extraDaysRows(tabela, 30);
    expect(rows).toHaveLength(10);
    expect(rows.at(-1)).toMatchObject({ days: 17, total: null, charge: null });
  });

  it("estadia maior que custa menos não vira valor negativo a cobrar", () => {
    const t = parseExtraDaysTable({ ...raw, prices: { "8": 151.2, "9": 140 } }) as ExtraDaysTable;
    expect(extraDaysRows(t, 1)[1]?.charge).toBe(0);
  });
});

describe("quoteExit", () => {
  it("saída dentro do período reservado: nada a cobrar", () => {
    expect(quoteExit(tabela, "2026-12-18T01:00:00Z")).toEqual({
      kind: "within",
      days: 8,
      extra: 0,
    });
  });

  it("a tolerância vale também na saída", () => {
    // 8 diárias acabam em 18/12 07:30; com 60 min de tolerância, 08:20 ainda é 8.
    expect(quoteExit(tabela, "2026-12-18T08:20:00Z")?.kind).toBe("within");
  });

  it("dois dias depois: cobra a diferença entre 10 e 8 diárias", () => {
    expect(quoteExit(tabela, "2026-12-19T09:00:00Z")).toEqual({
      kind: "charge",
      days: 10,
      extra: 2,
      total: 189,
      charge: 37.8,
    });
  });

  it("duração sem preço ou além da tabela não inventa valor", () => {
    expect(quoteExit(tabela, "2026-12-26T09:00:00Z")).toEqual({
      kind: "no_price",
      days: 17,
      extra: 9,
    });
    expect(quoteExit(tabela, "2027-01-20T09:00:00Z")).toMatchObject({
      kind: "beyond",
      lastDay: 17,
    });
  });

  it("data inválida não quebra a tela", () => {
    expect(quoteExit(tabela, "não é data")).toBeNull();
  });
});
