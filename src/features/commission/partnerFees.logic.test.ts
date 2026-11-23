import { describe, expect, it } from "vitest";
import {
  cardRows,
  channelInstallments,
  channelLabel,
  installmentText,
  partnerSchedule,
  payerLabel,
  type PartnerFeeTable,
} from "./partnerFees.logic";

// Números inventados: o repo é público.
const TABELA: PartnerFeeTable = {
  pix_bps: 80,
  card: [
    { from: 1, to: 1, bps: 250 },
    { from: 2, to: 12, bps: 300 },
  ],
  cet30_bps: [250, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400],
  antifraud_cents: null,
  anticipation_rate_bps: 200,
  withdrawal_fee_cents: 150,
  policy: { version: 1, enabled: true, maxInstallments: 12, interestFreeUpTo: 3, monthlyInterestPct: 2, minInstallmentCents: 500, absorb: "customer" },
  channels: [
    { name: null, take_rate_bps: 2000, card_fee_payer: "movepark", anticipation_payer: "partner", installments_max: null, installments_interest_free: null },
    { name: "Site do parceiro", take_rate_bps: 1200, card_fee_payer: "partner", anticipation_payer: "partner", installments_max: 6, installments_interest_free: 1 },
  ],
};

describe("tabela do cartão", () => {
  it("de 1x a 12x: taxa da faixa, antecipação e total em 30 dias", () => {
    const rows = cardRows(partnerSchedule(TABELA)!);
    expect(rows).toHaveLength(12);
    expect(rows[0]).toEqual({ installments: 1, cardBps: 250, anticipationBps: 0, totalBps: 250 });
    expect(rows[2]).toEqual({ installments: 3, cardBps: 300, anticipationBps: 200, totalBps: 500 });
    expect(rows[11]).toEqual({ installments: 12, cardBps: 300, anticipationBps: 1100, totalBps: 1400 });
  });

  it("sem o custo em 30 dias cadastrado, só a taxa do cartão", () => {
    const rows = cardRows(partnerSchedule({ ...TABELA, cet30_bps: null })!);
    expect(rows[2]).toEqual({ installments: 3, cardBps: 300, anticipationBps: null, totalBps: null });
  });

  it("tabela inválida ou ausente vira null (o card diz que ainda não está cadastrada)", () => {
    expect(partnerSchedule({ ...TABELA, card: null })).toBeNull();
    expect(partnerSchedule({ ...TABELA, pix_bps: null })).toBeNull();
  });
});

describe("canais", () => {
  it("nomeia o canal padrão e quem paga", () => {
    expect(channelLabel(TABELA.channels[0])).toBe("Vendas pela Movepark");
    expect(channelLabel(TABELA.channels[1])).toBe("Site do parceiro");
    expect(payerLabel("partner")).toBe("Você");
    expect(payerLabel("movepark")).toBe("Movepark");
  });

  it("parcelamento: a política da plataforma, ou a do canal quando ele tem a sua", () => {
    expect(channelInstallments(TABELA, TABELA.channels[0])).toEqual({ max: 12, interestFreeUpTo: 3, monthlyInterestPct: 2 });
    expect(channelInstallments(TABELA, TABELA.channels[1])).toEqual({ max: 6, interestFreeUpTo: 1, monthlyInterestPct: 2 });
  });

  it("texto do parcelamento", () => {
    expect(installmentText({ max: 12, interestFreeUpTo: 3, monthlyInterestPct: 2.99 })).toBe(
      "Até 12x. Sem juros até 3x; de 4x em diante o cliente paga juros de 2,99% ao mês.",
    );
    expect(installmentText({ max: 3, interestFreeUpTo: 3, monthlyInterestPct: 2.99 })).toBe("Até 3x, sem juros.");
    expect(installmentText({ max: 1, interestFreeUpTo: 1, monthlyInterestPct: 2.99 })).toBe("Só à vista.");
  });
});
