import { assertEquals } from "jsr:@std/assert";
import {
  chargebackAbsorbedByMaster,
  chargeWentWithSplit,
  classifyRefundOutcome,
  decideRefundSplit,
  executeRefund,
  manualRefundReason,
  partnerBalancePatch,
  partnerRefundCents,
  refundAbsorbedByMaster,
  refundSplitFor,
} from "./refund.ts";
import type { PaymentGateway, RecipientBalance, RefundInput, RefundResult, SplitRule } from "./types.ts";

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
  // 17/09/2026: a Pagar.me responde 200 com a transação de cancelamento `failed` ("Saldo
  // insuficiente"). É recusa processada: fila manual, nunca "pendente".
  assertEquals(classifyRefundOutcome(200, "failed"), "definitive");
  assertEquals(classifyRefundOutcome(200, "refunded"), "ok");
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

// ── Estorno híbrido (E0.3.6) ─────────────────────────────────────────────────

/** Venda de R$ 100: parceiro 80 (pagou taxa de R$ 1,00), Movepark 20. */
const pagamentoHibrido = { split: splitNovo, split_sent_to_gateway: true, debt_recovered_cents: 0, gateway_fee_cents: 100 };
const saldoOk = { availableCents: 50000, httpStatus: 200 };

Deno.test("partnerRefundCents: líquido = parte do parceiro menos a taxa que ele pagou, proporcional ao estorno", () => {
  assertEquals(partnerRefundCents(pagamentoHibrido, 10000, 10000), 7900);
  assertEquals(partnerRefundCents(pagamentoHibrido, 2500, 10000), 1975, "parcial de 25%");
  assertEquals(partnerRefundCents({ ...pagamentoHibrido, debt_recovered_cents: 8000 }, 10000, 10000), 0, "perna abatida a zero");
  assertEquals(partnerRefundCents({ ...pagamentoHibrido, gateway_fee_cents: null }, 10000, 10000), null, "taxa não apurada");
});

Deno.test("decideRefundSplit: com chave, taxa apurada e saldo que cobre, o gateway debita o parceiro", () => {
  const d = decideRefundSplit({ payment: pagamentoHibrido, moveparkRecipientId: "re_mp", amountCents: 10000, totalCents: 10000, hybridEnabled: true, balance: saldoOk });
  assertEquals(d.mode, "partner");
  assertEquals(d.partnerCents, 7900);
  assertEquals(d.partnerBalanceCents, 50000);
  assertEquals(d.rules!.map((r) => [r.recipientId, r.amount]), [["re_p", 7900], ["re_mp", 2100]]);
});

Deno.test("decideRefundSplit: cada condição da tabela cai no 100% master", () => {
  const base = { payment: pagamentoHibrido, moveparkRecipientId: "re_mp", amountCents: 10000, totalCents: 10000, hybridEnabled: true, balance: saldoOk };
  const casos: [string, Parameters<typeof decideRefundSplit>[0]][] = [
    ["chave desligada", { ...base, hybridEnabled: false }],
    ["taxa não apurada", { ...base, payment: { ...pagamentoHibrido, gateway_fee_cents: null } }],
    ["saldo curto", { ...base, balance: { availableCents: 7899, httpStatus: 200 } }],
    ["leitura ruim", { ...base, balance: { availableCents: null, httpStatus: 500 } }],
    ["sem leitura", { ...base, balance: null }],
    ["recebedor sumido", { ...base, recipientMissing: true }],
    ["perna abatida pela metade, taxa proporcional, saldo curto", { ...base, payment: { ...pagamentoHibrido, debt_recovered_cents: 4000 }, balance: { availableCents: 3800, httpStatus: 200 } }],
  ];
  for (const [nome, entrada] of casos) {
    const d = decideRefundSplit(entrada);
    assertEquals(d.mode, "master", nome);
    assertEquals(d.partnerCents, 0, nome);
    assertEquals(d.rules!.length, 1, nome);
    assertEquals(d.rules![0].recipientId, "re_mp", nome);
  }
  // Saldo EXATO cobre.
  assertEquals(decideRefundSplit({ ...base, balance: { availableCents: 7900, httpStatus: 200 } }).mode, "partner");
  // Perna abatida a ZERO: a cobrança foi ao gateway sem chave de split, então nem regra vai.
  const zerada = decideRefundSplit({ ...base, payment: { ...pagamentoHibrido, debt_recovered_cents: 8000 } });
  assertEquals(zerada.mode, "none");
  assertEquals(zerada.rules, undefined);
});

Deno.test("decideRefundSplit: cobrança sem split no gateway continua sem regra (custódia)", () => {
  const d = decideRefundSplit({ payment: { split: splitCustodia, split_sent_to_gateway: false, gateway_fee_cents: 100 }, moveparkRecipientId: "re_mp", amountCents: 10000, totalCents: 10000, hybridEnabled: true, balance: saldoOk });
  assertEquals(d.mode, "none");
  assertEquals(d.rules, undefined);
});

function gatewayFake(opts: { saldo: number; recusaParceiro?: boolean; payablesFee?: number | null }) {
  const chamadas: RefundInput[] = [];
  const gateway = {
    listPayables(id: string) {
      const fee = opts.payablesFee;
      return Promise.resolve({
        payables: fee == null ? [] : [{ feeCents: fee, anticipationFeeCents: 0, fraudCoverageFeeCents: 0, id }],
        raw: {},
        httpStatus: 200,
      });
    },
    getRecipientBalance(id: string): Promise<RecipientBalance> {
      return Promise.resolve({ availableCents: opts.saldo, waitingFundsCents: 0, transferredCents: 0, raw: { id }, httpStatus: 200 });
    },
    refundCharge(input: RefundInput): Promise<RefundResult> {
      chamadas.push(input);
      const comParceiro = (input.split ?? []).some((r) => r.role === "partner");
      if (comParceiro && opts.recusaParceiro) {
        return Promise.resolve({ chargeId: input.chargeId, status: "failed", refundedAmountCents: null, raw: { message: "insufficient funds" }, httpStatus: 422 });
      }
      return Promise.resolve({ chargeId: input.chargeId, status: "refunded", refundedAmountCents: input.amountCents ?? 10000, raw: {}, httpStatus: 200 });
    },
  } as unknown as PaymentGateway;
  return { gateway, chamadas };
}

Deno.test("executeRefund híbrido: lê o saldo, manda as duas regras e devolve modo partner sem dívida", async () => {
  const { gateway, chamadas } = gatewayFake({ saldo: 50000 });
  const exec = await executeRefund({ gateway, chargeId: "ch_1", payment: pagamentoHibrido, moveparkRecipientId: "re_mp", totalCents: 10000, hybridEnabled: true });
  assertEquals(exec.outcome, "ok");
  assertEquals(exec.mode, "partner");
  assertEquals(exec.absorbedByMaster, false);
  assertEquals(exec.partnerCents, 7900);
  assertEquals(exec.partnerBalanceCents, 50000);
  assertEquals(exec.partnerRecipientId, "re_p");
  assertEquals(chamadas.length, 1);
  assertEquals(chamadas[0].split!.length, 2);
  const patch = partnerBalancePatch(exec, "2026-09-16T18:00:00.000Z")!;
  assertEquals(patch.recipientId, "re_p");
  assertEquals(patch.patch.balance_available_cents, 50000);
});

Deno.test("executeRefund híbrido: gateway recusa a perna do parceiro, cai no 100% master e a dívida entra", async () => {
  const { gateway, chamadas } = gatewayFake({ saldo: 50000, recusaParceiro: true });
  const exec = await executeRefund({ gateway, chargeId: "ch_1", payment: pagamentoHibrido, moveparkRecipientId: "re_mp", totalCents: 10000, hybridEnabled: true });
  assertEquals(exec.outcome, "ok");
  assertEquals(exec.mode, "master");
  assertEquals(exec.absorbedByMaster, true);
  assertEquals(exec.partnerCents, 0);
  assertEquals(chamadas.length, 2);
  assertEquals(chamadas[1].split!.length, 1);
  assertEquals(chamadas[1].split![0].recipientId, "re_mp");
});

Deno.test("executeRefund com a chave desligada: não lê saldo, comportamento de sempre", async () => {
  let leuSaldo = false;
  const gateway = {
    getRecipientBalance() { leuSaldo = true; return Promise.resolve({ availableCents: 1, waitingFundsCents: 0, transferredCents: 0, raw: {}, httpStatus: 200 }); },
    refundCharge(input: RefundInput): Promise<RefundResult> {
      return Promise.resolve({ chargeId: input.chargeId, status: "refunded", refundedAmountCents: 10000, raw: {}, httpStatus: 200 });
    },
  } as unknown as PaymentGateway;
  const exec = await executeRefund({ gateway, chargeId: "ch_1", payment: pagamentoHibrido, moveparkRecipientId: "re_mp", totalCents: 10000 });
  assertEquals(leuSaldo, false);
  assertEquals(exec.mode, "master");
  assertEquals(exec.absorbedByMaster, true);
  assertEquals(partnerBalancePatch(exec, "x"), null);
});

Deno.test("executeRefund híbrido: sem taxa apurada, lê os recebíveis ao vivo e ainda debita o parceiro", async () => {
  const { gateway, chamadas } = gatewayFake({ saldo: 50000, payablesFee: 100 });
  const semTaxa = { ...pagamentoHibrido, gateway_fee_cents: null };
  const exec = await executeRefund({ gateway, chargeId: "ch_1", payment: semTaxa, moveparkRecipientId: "re_mp", totalCents: 10000, hybridEnabled: true });
  assertEquals(exec.mode, "partner");
  assertEquals(exec.partnerCents, 7900);
  assertEquals(exec.gatewayFeeCents, 100, "a taxa lida ao vivo volta para o chamador gravar");
  assertEquals(chamadas.length, 1);
});

Deno.test("executeRefund híbrido: recebível ainda não existe, taxa segue desconhecida e vai 100% master", async () => {
  const { gateway } = gatewayFake({ saldo: 50000, payablesFee: null });
  const semTaxa = { ...pagamentoHibrido, gateway_fee_cents: null };
  const exec = await executeRefund({ gateway, chargeId: "ch_1", payment: semTaxa, moveparkRecipientId: "re_mp", totalCents: 10000, hybridEnabled: true });
  assertEquals(exec.mode, "master");
  assertEquals(exec.gatewayFeeCents, null);
  assertEquals(exec.reason, "taxa do gateway ainda não apurada");
});
