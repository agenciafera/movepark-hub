import { assertEquals } from "jsr:@std/assert";
import { debtFromPayment, isPartnerRule, sendDebtEmail } from "./debt-email.ts";

const split = [
  { role: "partner", amount: 1440, chargeProcessingFee: true, liable: false },
  { role: "movepark", amount: 360, chargeProcessingFee: false, liable: true },
];

Deno.test("perna do parceiro: role, ou liable nas regras antigas", () => {
  assertEquals(isPartnerRule({ role: "partner" }), true);
  assertEquals(isPartnerRule({ role: "movepark", liable: true }), false);
  assertEquals(isPartnerRule({ liable: true }), true);
  assertEquals(isPartnerRule({ liable: false }), false);
});

Deno.test("dívida da cobrança = perna menos a taxa que o parceiro pagou, vezes a fração estornada", () => {
  assertEquals(debtFromPayment({ amount: "18.00", refunded_amount: "18.00", gateway_fee_cents: 18, split }), 1422);
  assertEquals(debtFromPayment({ amount: 18, refunded_amount: 18, gateway_fee_cents: null, split }), 1440);
  assertEquals(debtFromPayment({ amount: 18, refunded_amount: 9, gateway_fee_cents: 18, split }), 711);
  assertEquals(debtFromPayment({ amount: 18, refunded_amount: 18, gateway_fee_cents: 18, split: [{ role: "partner", amount: 1440, chargeProcessingFee: false }] }), 1440);
});

Deno.test("quem perde a reivindicação não manda", async () => {
  let leituras = 0;
  const admin = {
    from: () => ({
      update: () => ({ eq: () => ({ is: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) }),
      select: () => { leituras += 1; return { eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }), is: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }), in: () => Promise.resolve({ data: [] }) }; },
    }),
    rpc: () => Promise.resolve({ data: 0 }),
  };
  const sent = await sendDebtEmail(admin, {
    id: "p1", amount: 18, refunded_amount: 18, refund_reason: null, gateway_fee_cents: 18, split,
    booking: { code: "MP-X", location: { company_id: "c1" } },
  });
  assertEquals(sent, false);
  assertEquals(leituras, 0);
});
