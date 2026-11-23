import { describe, expect, it } from "vitest";
import {
  bandFor,
  cet30For,
  differsFromContract,
  formatBps,
  measuredAntifraudCents,
  measuredForBand,
  parseGatewayFeeSchedule,
  parseHundredths,
  validateGatewayFeeSchedule,
  type GatewayFeeMeasured,
  type GatewayFeeSchedule,
} from "./gatewayFees";

// Taxas inventadas: o repo é público e a proposta da Pagar.me tem sigilo.
const VALIDA: GatewayFeeSchedule = {
  version: 1,
  pix_bps: 80,
  card: [
    { from: 1, to: 1, bps: 250 },
    { from: 2, to: 6, bps: 300 },
    { from: 7, to: 12, bps: 350 },
  ],
  antifraud_cents: 5,
};

describe("validateGatewayFeeSchedule", () => {
  it("aceita faixas contíguas de 1x a 12x", () => {
    expect(validateGatewayFeeSchedule(VALIDA)).toBeNull();
  });
  it("recusa buraco entre faixas", () => {
    const s = {
      ...VALIDA,
      card: [
        { from: 1, to: 1, bps: 250 },
        { from: 2, to: 5, bps: 300 },
        { from: 7, to: 12, bps: 350 },
      ],
    };
    expect(validateGatewayFeeSchedule(s)).toBe("Falta a parcela de 6x.");
  });
  it("recusa sobreposição", () => {
    const s = {
      ...VALIDA,
      card: [
        { from: 1, to: 1, bps: 250 },
        { from: 2, to: 7, bps: 300 },
        { from: 7, to: 12, bps: 350 },
      ],
    };
    expect(validateGatewayFeeSchedule(s)).toBe("A faixa que começa em 7x se sobrepõe à anterior.");
  });
  it("recusa faixa que não começa em 1x e faixa que passa de 12x", () => {
    expect(validateGatewayFeeSchedule({ ...VALIDA, card: [{ from: 2, to: 12, bps: 300 }] })).toBe(
      "A primeira faixa começa em 1x.",
    );
    expect(validateGatewayFeeSchedule({ ...VALIDA, card: [{ from: 1, to: 13, bps: 300 }] })).toBe(
      "As faixas passam de 12x.",
    );
  });
  it("recusa quando falta o fim", () => {
    expect(validateGatewayFeeSchedule({ ...VALIDA, card: [{ from: 1, to: 6, bps: 300 }] })).toBe(
      "Faltam as parcelas de 7x a 12x.",
    );
  });
  it("recusa taxa fora de 0% a 20% e antifraude negativo", () => {
    expect(validateGatewayFeeSchedule({ ...VALIDA, pix_bps: 2001 })).toBe("Taxa do Pix fora de 0% a 20%.");
    expect(validateGatewayFeeSchedule({ ...VALIDA, pix_bps: Number.NaN })).toBe(
      "Taxa do Pix fora de 0% a 20%.",
    );
    expect(validateGatewayFeeSchedule({ ...VALIDA, antifraud_cents: -1 })).toBe(
      "Antifraude precisa ser um valor em reais não negativo.",
    );
    expect(validateGatewayFeeSchedule({ ...VALIDA, card: [{ from: 1, to: 12, bps: -1 }] })).toBe(
      "Taxa da faixa 1x a 12x fora de 0% a 20%.",
    );
  });
});

describe("parseGatewayFeeSchedule", () => {
  it("lê o JSON do app_setting e ordena as faixas", () => {
    const raw = JSON.stringify({ ...VALIDA, card: [...VALIDA.card].reverse() });
    expect(parseGatewayFeeSchedule(raw)).toEqual(VALIDA);
  });
  it("chave ausente, JSON quebrado ou tabela inválida viram null (a tela diz 'não cadastrado')", () => {
    expect(parseGatewayFeeSchedule(undefined)).toBeNull();
    expect(parseGatewayFeeSchedule("{")).toBeNull();
    expect(parseGatewayFeeSchedule(JSON.stringify({ ...VALIDA, card: [] }))).toBeNull();
  });
});

describe("bandFor", () => {
  it("acha a faixa da venda", () => {
    expect(bandFor(VALIDA, 1)).toEqual({ from: 1, to: 1, bps: 250 });
    expect(bandFor(VALIDA, 4)).toEqual({ from: 2, to: 6, bps: 300 });
    expect(bandFor(null, 4)).toBeNull();
    expect(bandFor(VALIDA, 13)).toBeNull();
  });
});

const MEDIDO: GatewayFeeMeasured = {
  days: 90,
  rows: [
    { method: "card", installments: 1, sales: 2, charged_cents: 20000, fee_cents: 500, fraud_cents: 10 },
    { method: "card", installments: 3, sales: 1, charged_cents: 10000, fee_cents: 340, fraud_cents: 0 },
    { method: "card", installments: 4, sales: 1, charged_cents: 10000, fee_cents: 260, fraud_cents: 0 },
    { method: "pix", installments: 1, sales: 4, charged_cents: 40000, fee_cents: 320, fraud_cents: 0 },
  ],
  anticipation: { payables: 3, fee_cents: 57, base_cents_month: 2850, monthly_bps: 200 },
};

describe("medido nas vendas", () => {
  it("divide a soma das taxas pela soma do cobrado dentro da faixa", () => {
    expect(measuredForBand(MEDIDO, "card", 1, 1)).toEqual({ sales: 2, bps: 250 });
    expect(measuredForBand(MEDIDO, "card", 2, 6)).toEqual({ sales: 2, bps: 300 });
    expect(measuredForBand(MEDIDO, "pix", 1, 1)).toEqual({ sales: 4, bps: 80 });
  });
  it("faixa sem venda devolve bps nulo", () => {
    expect(measuredForBand(MEDIDO, "card", 7, 12)).toEqual({ sales: 0, bps: null });
    expect(measuredForBand(undefined, "card", 1, 1)).toEqual({ sales: 0, bps: null });
  });
  it("antifraude médio por venda, sobre todas as vendas", () => {
    expect(measuredAntifraudCents(MEDIDO)).toBe(1);
    expect(measuredAntifraudCents(undefined)).toBeNull();
  });
});

describe("differsFromContract", () => {
  it("só acusa acima de 0,05 ponto percentual", () => {
    expect(differsFromContract(305, 300)).toBe(false);
    expect(differsFromContract(305.01, 300)).toBe(true);
    expect(differsFromContract(294.9, 300)).toBe(true);
    expect(differsFromContract(null, 300)).toBe(false);
    expect(differsFromContract(300, null)).toBe(false);
  });
});

describe("formatação", () => {
  it("bps vira percentual com vírgula", () => {
    expect(formatBps(250)).toBe("2,50%");
    expect(formatBps(80.6)).toBe("0,81%");
    expect(formatBps(null)).toBe("-");
  });
  it("texto do formulário vira centésimos (bps ou centavos)", () => {
    expect(parseHundredths("2,5")).toBe(250);
    expect(parseHundredths("1.07")).toBe(107);
    expect(parseHundredths(" ")).toBeNaN();
    expect(parseHundredths("abc")).toBeNaN();
  });
});

describe("condições em 30 dias (CET) e gateway por transação", () => {
  const CET = Array.from({ length: 12 }, (_, i) => 300 + i * 100);
  it("aceita a tabela com o custo em 30 dias de 1x a 12x e o gateway por transação", () => {
    const s = { ...VALIDA, processing_cents: 50, cet30_bps: CET };
    expect(validateGatewayFeeSchedule(s)).toBeNull();
    expect(parseGatewayFeeSchedule(JSON.stringify(s))).toEqual(s);
  });
  it("tabela antiga, sem essas chaves, continua valendo", () => {
    expect(parseGatewayFeeSchedule(JSON.stringify(VALIDA))).toEqual(VALIDA);
  });
  it("recusa custo em 30 dias incompleto ou fora de 0% a 50%, e gateway negativo", () => {
    expect(validateGatewayFeeSchedule({ ...VALIDA, cet30_bps: CET.slice(0, 11) })).toBe(
      "Preencha o custo em 30 dias de 1x a 12x.",
    );
    const furo = [...CET];
    furo[3] = Number.NaN;
    expect(validateGatewayFeeSchedule({ ...VALIDA, cet30_bps: furo })).toBe(
      "Preencha o custo em 30 dias de 4x.",
    );
    const alto = [...CET];
    alto[11] = 5001;
    expect(validateGatewayFeeSchedule({ ...VALIDA, cet30_bps: alto })).toBe(
      "Custo em 30 dias de 12x fora de 0% a 50%.",
    );
    expect(validateGatewayFeeSchedule({ ...VALIDA, processing_cents: -1 })).toBe(
      "Taxa do gateway por transação precisa ser um valor em reais não negativo.",
    );
  });
  it("acha o custo em 30 dias da venda", () => {
    const s = { ...VALIDA, cet30_bps: CET };
    expect(cet30For(s, 1)).toBe(300);
    expect(cet30For(s, 3)).toBe(500);
    expect(cet30For(s, 13)).toBeNull();
    expect(cet30For(VALIDA, 3)).toBeNull();
    expect(cet30For(null, 3)).toBeNull();
  });
});
