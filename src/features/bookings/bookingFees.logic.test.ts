import { describe, expect, it } from "vitest";
import { computeInstallmentPlan, type InstallmentPolicy } from "@/lib/installments";
import type { GatewayFeeSchedule } from "@/lib/gatewayFees";
import { buildMoneyBreakdown, type MoneyPaymentLike } from "./bookingMoney.logic";
import {
  buildFeeDetail,
  latestPayables,
  parsePayables,
  type FeeBookingLike,
  type FeePayable,
} from "./bookingFees.logic";

// Tudo inventado: o repo é público e as taxas da Pagar.me têm sigilo.
const POLICY: InstallmentPolicy = {
  version: 1,
  enabled: true,
  maxInstallments: 6,
  interestFreeUpTo: 2,
  monthlyInterestPct: 2,
  minInstallmentCents: 500,
  absorb: "customer",
};
const SCHEDULE = (cardBps: number): GatewayFeeSchedule => ({
  version: 1,
  pix_bps: 80,
  card: [
    { from: 1, to: 1, bps: cardBps },
    { from: 2, to: 6, bps: cardBps },
    { from: 7, to: 12, bps: cardBps },
  ],
  antifraud_cents: 5,
});

function payable(p: Partial<FeePayable> & { installment: number | null }): FeePayable {
  return {
    recipientId: "re_m",
    amountCents: 1000,
    feeCents: 0,
    anticipationFeeCents: 0,
    fraudCoverageFeeCents: 0,
    paymentDate: "2026-12-01T03:00:00Z",
    originalPaymentDate: "2026-12-01T03:00:00Z",
    ...p,
  };
}

// Cartão 2x de R$ 100: MDR 60 por parcela no recebedor da Movepark, a 2ª parcela antecipada
// (40 do estacionamento, 5 da Movepark) e antifraude 10. Total 175.
const CARTAO_2X: FeePayable[] = [
  payable({ installment: 1, recipientId: "re_p", amountCents: 4000 }),
  payable({ installment: 1, feeCents: 60, fraudCoverageFeeCents: 10 }),
  payable({
    installment: 2,
    recipientId: "re_p",
    amountCents: 4000,
    anticipationFeeCents: 40,
    paymentDate: "2026-11-05T03:00:00Z",
    originalPaymentDate: "2027-01-01T03:00:00Z",
  }),
  payable({
    installment: 2,
    feeCents: 60,
    anticipationFeeCents: 5,
    paymentDate: "2026-11-05T03:00:00Z",
    originalPaymentDate: "2027-01-01T03:00:00Z",
  }),
];

function cenario(
  o: {
    method?: "card" | "pix";
    chargedCents?: number;
    installments?: number;
    feeCents?: number | null;
    payables?: FeePayable[] | null;
    schedule?: GatewayFeeSchedule | null;
    booking?: Partial<FeeBookingLike>;
    custody?: boolean;
    refundedReais?: number | null;
    comp?: number | null;
  } = {},
) {
  const method = o.method ?? "card";
  const charged = o.chargedCents ?? 10000;
  const installments = o.installments ?? (method === "card" ? 2 : 1);
  const payment: MoneyPaymentLike = {
    status: "paid",
    method,
    amount: charged / 100,
    installments,
    split: [
      { role: "partner", amount: 8000, chargeProcessingFee: false },
      { role: "movepark", amount: charged - 8000, liable: true },
    ],
    split_sent_to_gateway: !o.custody,
    debt_recovered_cents: 0,
    gateway_fee_cents: o.feeCents === undefined ? 175 : o.feeCents,
    partner_release_at: null,
    paid_at: "2026-11-01T12:00:00Z",
    refunded_amount: o.refundedReais ?? null,
    refund_absorbed_by_master: false,
    refund_partner_cents: 0,
    created_at: "2026-11-01T12:00:00Z",
    anticipation_comp_cents: o.comp ?? null,
  };
  const money = buildMoneyBreakdown(
    { days: 1, total: 100, line_items: [{ kind: "parking", quantity: 1, subtotal: 100 }] },
    100,
    payment,
  );
  return buildFeeDetail({
    money,
    payment: {
      method,
      amount: charged / 100,
      installments,
      gateway_fee_cents: payment.gateway_fee_cents,
      anticipation_credit_cents: 40,
      anticipation_comp_cents: o.comp ?? null,
    },
    booking: {
      total_amount: 100,
      commission_channel: "hub",
      commission_take_rate_bps: 2000,
      commission_anticipation_payer: "movepark",
      ...o.booking,
    },
    payables: o.payables === undefined ? CARTAO_2X : o.payables,
    schedule: o.schedule === undefined ? SCHEDULE(118) : o.schedule,
    policy: POLICY,
    moveparkRecipientId: "re_m",
  });
}

describe("parsePayables", () => {
  it("lê o GET /payables cru, só crédito, com a data original caindo na de pagamento", () => {
    const raw = {
      data: [
        {
          type: "credit",
          recipient_id: "re_p",
          amount: 4000,
          fee: 0,
          anticipation_fee: 40,
          fraud_coverage_fee: 0,
          installment: 2,
          payment_date: "2026-11-05T03:00:00Z",
          original_payment_date: "2027-01-01T03:00:00Z",
        },
        {
          type: "credit",
          recipient_id: "re_m",
          amount: 1000,
          fee: 60,
          installment: 1,
          payment_date: "2026-12-01T03:00:00Z",
        },
        { type: "refund", recipient_id: "re_m", amount: -1000, fee: -60, installment: 1 },
      ],
      paging: {},
    };
    expect(parsePayables(raw)).toEqual([
      {
        recipientId: "re_p",
        amountCents: 4000,
        feeCents: 0,
        anticipationFeeCents: 40,
        fraudCoverageFeeCents: 0,
        installment: 2,
        paymentDate: "2026-11-05T03:00:00Z",
        originalPaymentDate: "2027-01-01T03:00:00Z",
      },
      {
        recipientId: "re_m",
        amountCents: 1000,
        feeCents: 60,
        anticipationFeeCents: 0,
        fraudCoverageFeeCents: 0,
        installment: 1,
        paymentDate: "2026-12-01T03:00:00Z",
        originalPaymentDate: "2026-12-01T03:00:00Z",
      },
    ]);
    expect(parsePayables(null)).toEqual([]);
    expect(parsePayables({ data: "x" })).toEqual([]);
  });
});

describe("latestPayables", () => {
  const ev = (payment_id: string, created_at: string, fee: number) => ({
    payment_id,
    kind: "payables",
    created_at,
    response: { data: [{ type: "credit", fee, amount: 1000, installment: 1 }] },
  });
  it("usa o último evento payables do pagamento", () => {
    const events = [
      ev("p1", "2026-11-01T10:00:00Z", 999),
      ev("p1", "2026-11-02T10:00:00Z", 60),
      ev("p2", "2026-11-03T10:00:00Z", 7),
      { payment_id: "p1", kind: "refund", created_at: "2026-11-04T10:00:00Z", response: {} },
    ];
    expect(latestPayables(events, "p1")?.map((p) => p.feeCents)).toEqual([60]);
  });
  it("sem evento, ou com evento vazio, devolve null", () => {
    expect(latestPayables([], "p1")).toBeNull();
    expect(
      latestPayables(
        [{ payment_id: "p1", kind: "payables", created_at: "x", response: { data: [] } }],
        "p1",
      ),
    ).toBeNull();
  });
});

describe("buildFeeDetail", () => {
  it("cartão 2x: resumo, linhas, total batendo com o pagamento e parcelas", () => {
    const d = cenario();
    expect(d.summary).toEqual({
      method: "card",
      chargedCents: 10000,
      installments: 2,
      firstInstallmentCents: 5000,
      installmentCents: 5000,
      partnerNetCents: 8000,
      moveparkNetCents: 1825,
      custody: false,
      refundedCents: 0,
    });
    expect(d.lines.map((l) => l.key)).toEqual(["commission", "mdr", "anticipation", "antifraud"]);
    expect(d.lines[0]).toEqual({
      key: "commission",
      cents: 2000,
      rateBps: 2000,
      channel: "hub",
      payer: "partner",
    });
    expect(d.lines[1]).toEqual({
      key: "mdr",
      method: "card",
      cents: 120,
      effectiveBps: 120,
      contractBps: 118,
      differs: false,
      payer: "movepark",
    });
    expect(d.lines[2]).toEqual({
      key: "anticipation",
      cents: 45,
      partnerCents: 40,
      moveparkCents: 5,
      anticipatedAt: "2026-11-05T03:00:00Z",
      creditCents: 40,
      compCents: 0,
      expected: false,
      payer: "movepark",
    });
    expect(d.lines[3]).toEqual({ key: "antifraud", cents: 10, payer: "movepark" });
    expect(d.gateway).toEqual({
      linesCents: 175,
      recordedCents: 175,
      expectedCents: 0,
      pending: false,
      stale: false,
      detailed: true,
    });
    expect(d.installments).toEqual([
      {
        installment: 1,
        customerCents: 5000,
        originalDate: "2026-12-01T03:00:00Z",
        receivedDate: "2026-12-01T03:00:00Z",
        mdrCents: 60,
        anticipationCents: 0,
        expected: false,
      },
      {
        installment: 2,
        customerCents: 5000,
        originalDate: "2027-01-01T03:00:00Z",
        receivedDate: "2026-11-05T03:00:00Z",
        mdrCents: 60,
        anticipationCents: 45,
        expected: false,
      },
    ]);
    expect(d.band).toEqual({ from: 2, to: 6, bps: 118 });
    expect(d.plan.chosen).toBe(2);
    expect(d.plan.reproduces).toBe(true);
  });

  it("recebíveis que não fecham com o pagamento acusam desatualizado", () => {
    expect(cenario({ feeCents: 176 }).gateway).toMatchObject({
      linesCents: 175,
      recordedCents: 176,
      stale: true,
    });
  });

  it("taxa ainda não apurada: pendente, sem acusar diferença", () => {
    expect(cenario({ feeCents: null }).gateway).toMatchObject({ pending: true, stale: false });
  });

  it("sem evento payables: só o total, sem detalhe por parcela", () => {
    const d = cenario({ payables: null });
    expect(d.gateway).toEqual({
      linesCents: null,
      recordedCents: 175,
      expectedCents: 0,
      pending: false,
      stale: false,
      detailed: false,
    });
    expect(d.lines.find((l) => l.key === "mdr")).toMatchObject({ cents: null, effectiveBps: null });
    expect(d.installments.map((p) => [p.customerCents, p.mdrCents])).toEqual([
      [5000, null],
      [5000, null],
    ]);
  });

  it("resto de centavos vai na primeira parcela", () => {
    const d = cenario({ installments: 3 });
    expect(d.installments.map((p) => p.customerCents)).toEqual([3334, 3333, 3333]);
    expect(d.summary).toMatchObject({ firstInstallmentCents: 3334, installmentCents: 3333 });
  });

  it("acusa diferente do contrato só acima de 0,05 p.p.", () => {
    const mdr = (bps: number) =>
      cenario({ schedule: SCHEDULE(bps) }).lines.find((l) => l.key === "mdr");
    expect(mdr(125)).toMatchObject({ differs: false });
    expect(mdr(126)).toMatchObject({ differs: true });
    expect(cenario({ schedule: null }).lines.find((l) => l.key === "mdr")).toMatchObject({
      contractBps: null,
      differs: false,
    });
  });

  it("juros com a regra quando a política de hoje reproduz o cobrado", () => {
    const quatro = computeInstallmentPlan(10000, POLICY).find((o) => o.installments === 4)!;
    const d = cenario({ installments: 4, chargedCents: quatro.totalCents });
    expect(d.lines.find((l) => l.key === "interest")).toEqual({
      key: "interest",
      cents: quatro.totalCents - 10000,
      rule: { monthlyPct: 2, freeUpTo: 2 },
      payer: "customer",
    });
    expect(d.plan.reproduces).toBe(true);
  });

  it("juros sem percentual quando a venda seguiu outra condição", () => {
    const quatro = computeInstallmentPlan(10000, POLICY).find((o) => o.installments === 4)!;
    const d = cenario({ installments: 4, chargedCents: quatro.totalCents + 1 });
    expect(d.lines.find((l) => l.key === "interest")).toMatchObject({ rule: null });
    expect(d.plan.reproduces).toBe(false);
  });

  it("aplica o parcelamento congelado na reserva antes de comparar", () => {
    const d = cenario({
      installments: 4,
      booking: { commission_installments_max: 4, commission_installments_interest_free: 4 },
    });
    expect(d.lines.some((l) => l.key === "interest")).toBe(false);
    expect(d.plan.reproduces).toBe(true);
    expect(d.plan.options.map((o) => o.installments)).toEqual([1, 2, 3, 4]);
  });

  it("Pix: sem parcelas e sem antecipação, contrato do Pix", () => {
    const d = cenario({
      method: "pix",
      feeCents: 80,
      payables: [payable({ installment: null, feeCents: 80, amountCents: 2000 })],
    });
    expect(d.lines.map((l) => l.key)).toEqual(["commission", "mdr", "antifraud"]);
    expect(d.lines[1]).toMatchObject({
      method: "pix",
      cents: 80,
      effectiveBps: 80,
      contractBps: 80,
      differs: false,
    });
    expect(d.installments).toEqual([]);
    expect(d.band).toBeNull();
    expect(d.summary).toMatchObject({ method: "pix", installments: 1 });
  });

  it("antecipação ainda não feita fica em zero", () => {
    const d = cenario({
      payables: CARTAO_2X.map((p) => ({ ...p, anticipationFeeCents: 0 })),
      feeCents: 130,
    });
    expect(d.lines.find((l) => l.key === "anticipation")).toMatchObject({
      cents: 0,
      anticipatedAt: null,
    });
  });

  it("antecipação ainda não feita, com cessão gravada: taxa prevista e parcelas entrando junto com a 1ª", () => {
    const semAntecipacao = CARTAO_2X.map((p) => ({
      ...p,
      anticipationFeeCents: 0,
      paymentDate: p.originalPaymentDate,
    }));
    const d = cenario({ installments: 3, payables: semAntecipacao, feeCents: 130, comp: 300 });
    expect(d.lines.find((l) => l.key === "anticipation")).toEqual({
      key: "anticipation",
      cents: 300,
      partnerCents: 300,
      moveparkCents: 0,
      anticipatedAt: "2026-12-01T03:00:00Z",
      creditCents: 40,
      compCents: 300,
      expected: true,
      payer: "movepark",
    });
    expect(d.gateway).toMatchObject({ linesCents: 130, recordedCents: 130, expectedCents: 300, stale: false });
    // Dias antecipados: 0, 30 e 60; a taxa prevista se divide nessa proporção.
    expect(d.installments.map((p) => [p.receivedDate, p.anticipationCents, p.expected])).toEqual([
      ["2026-12-01T03:00:00Z", 0, false],
      ["2026-12-01T03:00:00Z", 100, true],
      ["2026-12-01T03:00:00Z", 200, true],
    ]);
  });

  it("antecipação já feita mostra a real e quanto a Movepark cedeu no split", () => {
    const d = cenario({ comp: 30 });
    expect(d.lines.find((l) => l.key === "anticipation")).toMatchObject({
      cents: 45,
      expected: false,
      compCents: 30,
    });
    expect(d.gateway.expectedCents).toBe(0);
  });

  it("sem cessão e sem antecipação continua \"ainda não antecipado\"", () => {
    const d = cenario({
      payables: CARTAO_2X.map((p) => ({ ...p, anticipationFeeCents: 0 })),
      feeCents: 130,
    });
    expect(d.lines.find((l) => l.key === "anticipation")).toMatchObject({ cents: 0, expected: false });
  });

  it("sem split e com estorno aparecem no resumo", () => {
    expect(cenario({ custody: true }).summary.custody).toBe(true);
    expect(cenario({ refundedReais: 100 }).summary.refundedCents).toBe(10000);
  });
});
