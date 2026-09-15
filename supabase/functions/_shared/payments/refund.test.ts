import { assertEquals } from "jsr:@std/assert";
import {
  chargebackAbsorbedByMaster,
  chargeWentWithSplit,
  classifyRefundOutcome,
  executeRefund,
  manualRefundReason,
  refundAbsorbedByMaster,
  refundSplitFor,
} from "./refund.ts";
import type { PaymentGateway, RefundInput, RefundResult, SplitRule } from "./types.ts";

const splitNovo: SplitRule[] = [
  { role: "partner", recipientId: "re_p", amount: 8000, type: "flat", liable: false, chargeProcessingFee: true, chargeRemainderFee: true },
  { role: "movepark", recipientId: "re_mp", amount: 2000, type: "flat", liable: true, chargeProcessingFee: false, chargeRemainderFee: false },
];
const splitCustodia: SplitRule[] = [
  { role: "partner", recipientId: null, amount: 8000, type: "flat", liable: false, chargeProcessingFee: true, chargeRemainderFee: true },
  { role: "movepark", recipientId: "re_mp", amount: 2000, type: "flat", liable: true, chargeProcessingFee: false, chargeRemainderFee: false },
];

Deno.test("cobrança com split no gateway estorna com a regra do master", () => {
  const p = { split: splitNovo, split_sent_to_gateway: true, debt_recovered_cents: 0 };
  assertEquals(chargeWentWithSplit(p), true);
  const s = refundSplitFor(p, "re_mp", 10000)!;
  assertEquals(s.length, 1);
  assertEquals([s[0].recipientId, s[0].amount], ["re_mp", 10000]);
  assertEquals(refundAbsorbedByMaster(p), true);
});

Deno.test("custódia (split não enviado) estorna sem regra e não gera dívida", () => {
  const p = { split: splitCustodia, split_sent_to_gateway: false };
  assertEquals(chargeWentWithSplit(p), false);
  assertEquals(refundSplitFor(p, "re_mp", 10000), undefined);
  assertEquals(refundAbsorbedByMaster(p), false);
});

Deno.test("parceiro zerado pelo abatimento: a cobrança foi sem split, o estorno vai sem regra, mas a dívida entra", () => {
  // O gateway recusaria regra em cobrança capturada sem split. E o razão precisa desfazer o
  // abatimento: absorvido continua true.
  const p = { split: splitNovo, split_sent_to_gateway: true, debt_recovered_cents: 8000 };
  assertEquals(chargeWentWithSplit(p), false);
  assertEquals(refundSplitFor(p, "re_mp", 10000), undefined);
  assertEquals(refundAbsorbedByMaster(p), true);
});

Deno.test("regra antiga sem role (liable marca o parceiro) também é reconhecida", () => {
  const antigo: SplitRule[] = [
    { recipientId: "re_p", amount: 8000, type: "flat", liable: true, chargeProcessingFee: true, chargeRemainderFee: true },
    { recipientId: "re_mp", amount: 2000, type: "flat", liable: false, chargeProcessingFee: false, chargeRemainderFee: false },
  ];
  assertEquals(chargeWentWithSplit({ split: antigo, split_sent_to_gateway: true }), true);
});

Deno.test("classifyRefundOutcome: 2xx ok, 4xx definitivo, 408/409/429 e 5xx incertos", () => {
  assertEquals(classifyRefundOutcome(200), "ok");
  for (const s of [400, 404, 412, 422]) assertEquals(classifyRefundOutcome(s), "definitive", `HTTP ${s}`);
  for (const s of [408, 409, 429, 500, 502, 503, 0, null, undefined]) {
    assertEquals(classifyRefundOutcome(s), "transient", `HTTP ${s}`);
  }
});

Deno.test("manualRefundReason lê o motivo da resposta crua, e na dúvida é 'recusado'", () => {
  assertEquals(manualRefundReason({ message: "Refund period expired: 90 days" }), "gateway_deadline");
  assertEquals(manualRefundReason({ errors: { balance: ["insufficient funds"] } }), "gateway_no_balance");
  assertEquals(manualRefundReason({ message: "Charge is in a final state" }), "gateway_refused");
  assertEquals(manualRefundReason(null), "gateway_refused");
});

Deno.test("executeRefund manda a regra do master no total e no parcial, e devolve o que gravar", async () => {
  const chamadas: RefundInput[] = [];
  const gateway = {
    refundCharge(input: RefundInput): Promise<RefundResult> {
      chamadas.push(input);
      return Promise.resolve({ chargeId: input.chargeId, status: "refunded", refundedAmountCents: input.amountCents ?? 10000, raw: {}, httpStatus: 200 });
    },
  } as unknown as PaymentGateway;
  const payment = { split: splitNovo, split_sent_to_gateway: true, debt_recovered_cents: 0 };

  const total = await executeRefund({ gateway, chargeId: "ch_1", payment, moveparkRecipientId: "re_mp", totalCents: 10000 });
  assertEquals(total.outcome, "ok");
  assertEquals(total.absorbedByMaster, true);
  assertEquals(chamadas[0].amountCents, undefined);
  assertEquals(chamadas[0].split![0].amount, 10000);

  const parcial = await executeRefund({ gateway, chargeId: "ch_1", payment, moveparkRecipientId: "re_mp", totalCents: 10000, amountCents: 2500 });
  assertEquals(chamadas[1].amountCents, 2500);
  assertEquals(chamadas[1].split![0].amount, 2500, "no parcial a regra do master leva o valor parcial");
  assertEquals(parcial.absorbedByMaster, true);
});

Deno.test("chargebackAbsorbedByMaster: só quando o split foi ao gateway com liable na Movepark", () => {
  assertEquals(chargebackAbsorbedByMaster({ split: splitNovo, split_sent_to_gateway: true }), true);
  assertEquals(chargebackAbsorbedByMaster({ split: splitNovo, split_sent_to_gateway: false }), false, "custódia");
  const antigo: SplitRule[] = [
    { recipientId: "re_p", amount: 8000, type: "flat", liable: true, chargeProcessingFee: true, chargeRemainderFee: true },
    { recipientId: "re_mp", amount: 2000, type: "flat", liable: false, chargeProcessingFee: false, chargeRemainderFee: false },
  ];
  assertEquals(chargebackAbsorbedByMaster({ split: antigo, split_sent_to_gateway: true }), false, "split antigo: o gateway debitou o parceiro");
});
