import { describe, expect, it } from "vitest";
import { buildMoneyBreakdown, mainPayment, type MoneyPaymentLike } from "./bookingMoney.logic";

const split = [
  { role: "partner", amount: 1440, liable: false, chargeProcessingFee: true },
  { role: "movepark", amount: 1650, liable: true, chargeProcessingFee: false },
];
const pay = (over: Partial<MoneyPaymentLike> = {}): MoneyPaymentLike => ({
  status: "paid", method: "card", amount: 30.9, installments: 1, split, split_sent_to_gateway: true,
  debt_recovered_cents: 0, gateway_fee_cents: 117, partner_release_at: "2026-10-20T03:00:00Z",
  refunded_amount: null, refund_absorbed_by_master: false, refund_partner_cents: 0, created_at: "2026-09-18T17:36:40Z", ...over,
});
const breakdown = {
  days: 1,
  total: 30.9,
  line_items: [
    { kind: "parking", name: "uncovered", quantity: 1, subtotal: 18 },
    { kind: "fare", name: "Flex", tier: "flex", quantity: 1, subtotal: 12.9 },
  ],
};

describe("buildMoneyBreakdown", () => {
  it("MP-7E2482: diária + plano, parceiro líquido da taxa, Movepark com comissão e plano", () => {
    const m = buildMoneyBreakdown(breakdown, 30.9, pay());
    expect(m.customer.lines).toEqual([
      { kind: "parking", label: "Estacionamento (diária)", cents: 1800 },
      { kind: "fare", label: "Plano Flex", cents: 1290 },
    ]);
    expect(m.customer.chargedCents).toBe(3090);
    expect(m.split?.partner).toEqual({ grossCents: 1440, debtRecoveredCents: 0, feeCents: 117, netCents: 1323, releaseAt: "2026-10-20T03:00:00Z", withdrawAt: null });
    expect(m.split?.feePayer).toBe("partner");
    expect(m.split?.movepark).toMatchObject({ commissionCents: 360, fareCents: 1290, feeCents: 0, netCents: 1650 });
    expect(m.refund).toBeNull();
  });

  it("abatimento de dívida sai da perna do parceiro e entra na Movepark (MP-62A79F)", () => {
    const pix = pay({ method: "pix", amount: 18, gateway_fee_cents: 18, debt_recovered_cents: 1422, split: [{ role: "partner", amount: 1440, chargeProcessingFee: true }, { role: "movepark", amount: 360 }] });
    const m = buildMoneyBreakdown({ days: 1, total: 18, line_items: [{ kind: "parking", subtotal: 18 }] }, 18, pix);
    expect(m.split?.partner.netCents).toBe(0);
    expect(m.split?.movepark).toMatchObject({ commissionCents: 360, debtRecoveredCents: 1422, netCents: 1782 });
  });

  it("custódia: tudo na Movepark, parceiro a repassar, taxa da Movepark (MP-6CFA4B)", () => {
    const m = buildMoneyBreakdown(breakdown, 30.9, pay({ split_sent_to_gateway: false }));
    expect(m.split?.custody).toBe(true);
    expect(m.split?.partner).toMatchObject({ grossCents: 1440, feeCents: 0, netCents: 1440 });
    expect(m.split?.movepark.feeCents).toBe(117);
  });

  it("cupom, juros, taxa pendente e estorno pago pela Movepark virando dívida líquida", () => {
    const m = buildMoneyBreakdown(
      { days: 2, total: 30, coupon: { code: "BEMVINDO" }, line_items: [{ kind: "parking", quantity: 2, subtotal: 36 }] },
      30,
      pay({ amount: 33, installments: 3, gateway_fee_cents: null, split: [{ role: "partner", amount: 2400, chargeProcessingFee: true }, { role: "movepark", amount: 900 }], status: "refunded", refunded_amount: 33, refund_absorbed_by_master: true }),
    );
    expect(m.customer.lines).toEqual([
      { kind: "parking", label: "Estacionamento (2 diárias)", cents: 3600 },
      { kind: "discount", label: "Cupom BEMVINDO", cents: -600 },
      { kind: "interest", label: "Juros do parcelamento", cents: 300 },
    ]);
    expect(m.split?.feePending).toBe(true);
    expect(m.split?.movepark.interestCents).toBe(300);
    expect(m.refund).toEqual({ totalCents: 3300, partnerCents: 0, moveparkCents: 3300, debtCents: 2400 });
  });

  it("sem pagamento pago não há divisão; mainPayment prefere o pago ao mais recente recusado", () => {
    expect(buildMoneyBreakdown(breakdown, 30.9, null).split).toBeNull();
    expect(buildMoneyBreakdown(breakdown, 30.9, pay({ status: "failed" })).split).toBeNull();
    const pago = { status: "paid", created_at: "2026-09-18T17:36:00Z" };
    expect(mainPayment([{ status: "failed", created_at: "2026-09-18T17:40:00Z" }, pago])).toBe(pago);
    expect(mainPayment([])).toBeNull();
  });
});

// 22/09/2026: quem paga a taxa e quando a venda libera para saque.
describe("taxa e liberação para saque", () => {
  it("com a Movepark pagando a taxa, feePayer é movepark e o líquido dela desconta a taxa", () => {
    const m = buildMoneyBreakdown(breakdown, 30.9, pay({
      split: [
        { role: "partner", amount: 1440, liable: false, chargeProcessingFee: false },
        { role: "movepark", amount: 1650, liable: true, chargeProcessingFee: true },
      ],
    }));
    expect(m.split?.feePayer).toBe("movepark");
    expect(m.split?.partner.feeCents).toBe(0);
    expect(m.split?.movepark.feeCents).toBe(117);
    expect(m.split?.movepark.netCents).toBe(1533);
  });
  it("a data de saque é o pagamento mais o prazo da empresa, e existe antes de o gateway informar o recebível", () => {
    const m = buildMoneyBreakdown(breakdown, 30.9, pay({ paid_at: "2026-09-22T12:22:06Z", partner_release_at: null, gateway_fee_cents: null }), 30);
    expect(m.split?.partner.withdrawAt).toBe("2026-10-22T12:22:06.000Z");
    expect(m.split?.partner.releaseAt).toBeNull();
    expect(m.split?.feePending).toBe(true);
  });
  it("sem o prazo da empresa a data de saque fica vazia em vez de inventada", () => {
    expect(buildMoneyBreakdown(breakdown, 30.9, pay({ paid_at: "2026-09-22T12:22:06Z" })).split?.partner.withdrawAt).toBeNull();
  });
});
