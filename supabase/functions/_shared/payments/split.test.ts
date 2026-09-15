import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  buildSplit,
  isGatewaySplitEnabled,
  maxDebtRecoveryCents,
  partnerRule,
  refundSplitToMaster,
  splitForGateway,
} from "./split.ts";

// PIX/à vista: chargedCents == baseCents (regressão — comportamento original).
Deno.test("buildSplit: comissão + parceiro somam o total; parceiro absorve taxas", () => {
  const rules = buildSplit({
    chargedCents: 10000,
    baseCents: 10000,
    takeRateBps: 1500, // 15%
    moveparkRecipientId: "rp_mp",
    partnerRecipientId: "rp_partner",
  });
  assertEquals(rules.length, 2);
  const partner = rules.find((r) => r.recipientId === "rp_partner")!;
  const mp = rules.find((r) => r.recipientId === "rp_mp")!;
  assertEquals(partner.amount, 8500);
  assertEquals(mp.amount, 1500);
  assertEquals(partner.amount + mp.amount, 10000);
  // E0.3.5: o chargeback (liable) passou para a Movepark; a taxa de processamento segue no parceiro.
  assertEquals(partner.liable, false);
  assertEquals(partner.chargeProcessingFee, true);
  assertEquals(partner.chargeRemainderFee, true);
  assertEquals(mp.liable, true);
  assertEquals(mp.chargeProcessingFee, false);
});

Deno.test("buildSplit: take_rate 0 → só a perna do parceiro", () => {
  const rules = buildSplit({
    chargedCents: 5000,
    baseCents: 5000,
    takeRateBps: 0,
    moveparkRecipientId: "",
    partnerRecipientId: "rp_partner",
  });
  assertEquals(rules.length, 1);
  assertEquals(rules[0].amount, 5000);
});

Deno.test("buildSplit: comissão exige recebedor master configurado", () => {
  assertThrows(() =>
    buildSplit({ chargedCents: 10000, baseCents: 10000, takeRateBps: 1500, moveparkRecipientId: "", partnerRecipientId: "rp_partner" })
  );
});

Deno.test("buildSplit: rejeita parceiro ausente e valor inválido", () => {
  assertThrows(() =>
    buildSplit({ chargedCents: 10000, baseCents: 10000, takeRateBps: 1500, moveparkRecipientId: "rp_mp", partnerRecipientId: "" })
  );
  assertThrows(() =>
    buildSplit({ chargedCents: 0, baseCents: 0, takeRateBps: 1500, moveparkRecipientId: "rp_mp", partnerRecipientId: "rp_partner" })
  );
});

// Cartão com juros ao cliente: chargedCents > baseCents → excedente vai pra Movepark.
Deno.test("buildSplit: excedente de juros (charged > base) vai pra Movepark; parceiro sobre o base", () => {
  const rules = buildSplit({
    chargedCents: 11000, // R$110 cobrado (R$100 base + R$10 juros)
    baseCents: 10000,
    takeRateBps: 1500,
    moveparkRecipientId: "rp_mp",
    partnerRecipientId: "rp_partner",
  });
  const partner = rules.find((r) => r.recipientId === "rp_partner")!;
  const mp = rules.find((r) => r.recipientId === "rp_mp")!;
  assertEquals(partner.amount, 8500); // base − comissão (NÃO muda com o juros)
  assertEquals(mp.amount, 2500); // comissão 1500 + excedente 1000
  assertEquals(partner.amount + mp.amount, 11000); // soma == cobrado
});

Deno.test("buildSplit: excedente com take_rate 0 → Movepark recebe só o juros", () => {
  const rules = buildSplit({
    chargedCents: 10500,
    baseCents: 10000,
    takeRateBps: 0,
    moveparkRecipientId: "rp_mp",
    partnerRecipientId: "rp_partner",
  });
  assertEquals(rules.length, 2);
  assertEquals(rules.find((r) => r.recipientId === "rp_partner")!.amount, 10000);
  assertEquals(rules.find((r) => r.recipientId === "rp_mp")!.amount, 500);
});

Deno.test("buildSplit: rejeita cobrado menor que o base", () => {
  assertThrows(() =>
    buildSplit({ chargedCents: 9000, baseCents: 10000, takeRateBps: 1500, moveparkRecipientId: "rp_mp", partnerRecipientId: "rp_partner" })
  );
});

// Tarifa (E2.8): receita Movepark fora do split da vaga. base do parceiro = vaga; charged = vaga + tarifa.
Deno.test("buildSplit: Tarifa (Flex R$12,90) cai 100% na Movepark, não toca o repasse do parceiro", () => {
  const rules = buildSplit({
    chargedCents: 11290, // R$100 vaga + R$12,90 tarifa
    baseCents: 10000, // base do parceiro = só a vaga
    takeRateBps: 1500,
    moveparkRecipientId: "rp_mp",
    partnerRecipientId: "rp_partner",
  });
  const partner = rules.find((r) => r.recipientId === "rp_partner")!;
  const mp = rules.find((r) => r.recipientId === "rp_mp")!;
  assertEquals(partner.amount, 8500); // 10000 − 1500 comissão (tarifa não entra)
  assertEquals(mp.amount, 2790); // comissão 1500 + tarifa 1290
  assertEquals(partner.amount + mp.amount, 11290);
});

Deno.test("buildSplit: Tarifa com take_rate 0 → Movepark recebe só a tarifa", () => {
  const rules = buildSplit({
    chargedCents: 12490, // vaga R$100 + Superflex R$24,90
    baseCents: 10000,
    takeRateBps: 0,
    moveparkRecipientId: "rp_mp",
    partnerRecipientId: "rp_partner",
  });
  assertEquals(rules.find((r) => r.recipientId === "rp_partner")!.amount, 10000);
  assertEquals(rules.find((r) => r.recipientId === "rp_mp")!.amount, 2490);
});

Deno.test("buildSplit: Tarifa + juros de parcelamento somam na perna da Movepark", () => {
  const rules = buildSplit({
    chargedCents: 12290, // vaga 10000 + tarifa 1290 + juros 1000
    baseCents: 10000,
    takeRateBps: 1500,
    moveparkRecipientId: "rp_mp",
    partnerRecipientId: "rp_partner",
  });
  assertEquals(rules.find((r) => r.recipientId === "rp_partner")!.amount, 8500);
  assertEquals(rules.find((r) => r.recipientId === "rp_mp")!.amount, 3790); // 1500 + 1290 + 1000
});

Deno.test("isGatewaySplitEnabled: default é LIGADO quando a chave não existe", () => {
  // Chave ausente ou vazia não pode desligar split por acidente.
  assertEquals(isGatewaySplitEnabled(undefined), true);
  assertEquals(isGatewaySplitEnabled(null), true);
  assertEquals(isGatewaySplitEnabled(""), true);
  assertEquals(isGatewaySplitEnabled("   "), true);
});

Deno.test("isGatewaySplitEnabled: só 'false' desliga", () => {
  assertEquals(isGatewaySplitEnabled("false"), false);
  assertEquals(isGatewaySplitEnabled("FALSE"), false);
  assertEquals(isGatewaySplitEnabled("  false  "), false);
  assertEquals(isGatewaySplitEnabled("true"), true);
  assertEquals(isGatewaySplitEnabled("qualquer coisa"), true);
});

// ── Custódia: o recebedor do parceiro não é pré-requisito para VENDER ────────
// Com o split desligado, o pedido sai sem a chave `split` e a cobrança cai inteira na conta da
// Movepark. Exigir o recebedor do parceiro nesse caminho recusava com 409 uma venda que o gateway
// aceitaria, e contradiz a separação que a própria spec faz: publicar no catálogo é um concern,
// estar apto a receber é outro (E1.9 deixa o parceiro publicar antes do KYC de propósito).
//
// O snapshot continua sendo gravado, porque é o razão do que devemos. Quem lê esse razão
// (payout_owed_cents, payout_statement) usa `liable` e o valor, nunca o `recipientId`, e o repasse
// pega o destino em `payout_recipient`. Por isso a perna pode nascer sem id.

Deno.test("custódia: monta o razão sem recebedor do parceiro", () => {
  const rules = buildSplit({
    chargedCents: 10000,
    baseCents: 10000,
    takeRateBps: 2000,
    moveparkRecipientId: "re_master",
    partnerRecipientId: null,
    requireRecipients: false,
  });
  assertEquals(rules.length, 2);
  assertEquals(rules[0].amount, 8000);
  assertEquals(rules[0].role, "partner");
  assertEquals(rules[0].recipientId, null);
  assertEquals(rules[1].amount, 2000);
  assertEquals(rules[1].role, "movepark");
  assertEquals(rules[1].liable, true);
});

Deno.test("custódia: a invariante da soma continua valendo", () => {
  const rules = buildSplit({
    chargedCents: 10290,
    baseCents: 10290,
    takeRateBps: 2000,
    moveparkRecipientId: null,
    partnerRecipientId: null,
    requireRecipients: false,
  });
  assertEquals(rules.reduce((a, r) => a + r.amount, 0), 10290);
});

Deno.test("com split no gateway, o recebedor do parceiro segue obrigatório", () => {
  let erro: string | null = null;
  try {
    buildSplit({
      chargedCents: 10000,
      baseCents: 10000,
      takeRateBps: 2000,
      moveparkRecipientId: "re_master",
      partnerRecipientId: null,
      requireRecipients: true,
    });
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }
  assertEquals(erro, "Recebedor do parceiro ausente.");
});

Deno.test("com split no gateway, o master segue obrigatório quando há comissão", () => {
  let erro: string | null = null;
  try {
    buildSplit({
      chargedCents: 10000,
      baseCents: 10000,
      takeRateBps: 2000,
      moveparkRecipientId: null,
      partnerRecipientId: "re_parceiro",
      requireRecipients: true,
    });
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }
  assertEquals(erro, "Recebedor master da Movepark não configurado.");
});

// ── E0.3.5: role, liable no master, split dinâmico e estorno 100% master ──────

Deno.test("E0.3.5: a perna do parceiro leva role=partner e o chargeback (liable) vai para a Movepark", () => {
  const rules = buildSplit({
    chargedCents: 20000, baseCents: 20000, takeRateBps: 2000,
    moveparkRecipientId: "re_mp", partnerRecipientId: "re_p",
  });
  const p = rules.find((r) => r.role === "partner")!;
  const m = rules.find((r) => r.role === "movepark")!;
  assertEquals([p.amount, p.liable, p.chargeProcessingFee], [16000, false, true]);
  assertEquals([m.amount, m.liable, m.chargeProcessingFee], [4000, true, false]);
  assertEquals(partnerRule(rules), p);
});

Deno.test("E0.3.5: sem perna da Movepark (take_rate 0), o parceiro fica liable, porque o gateway exige um", () => {
  const rules = buildSplit({
    chargedCents: 10000, baseCents: 10000, takeRateBps: 0,
    moveparkRecipientId: "re_mp", partnerRecipientId: "re_p",
  });
  assertEquals(rules.length, 1);
  assertEquals(rules[0].liable, true);
});

Deno.test("splitForGateway: sem dívida, o payload é o próprio razão", () => {
  const rules = buildSplit({
    chargedCents: 10000, baseCents: 10000, takeRateBps: 2000,
    moveparkRecipientId: "re_mp", partnerRecipientId: "re_p",
  });
  assertEquals(splitForGateway(rules, 0, "re_mp"), rules);
});

Deno.test("splitForGateway: abatimento parcial reduz o parceiro e engorda a Movepark, total intacto", () => {
  const rules = buildSplit({
    chargedCents: 10000, baseCents: 10000, takeRateBps: 2000,
    moveparkRecipientId: "re_mp", partnerRecipientId: "re_p",
  });
  const out = splitForGateway(rules, 3000, "re_mp")!;
  assertEquals(out.map((r) => [r.role, r.amount]), [["partner", 5000], ["movepark", 5000]]);
  assertEquals(out.reduce((a, r) => a + r.amount, 0), 10000);
  // o razão não muda: a perna normal continua 8000
  assertEquals(partnerRule(rules)!.amount, 8000);
});

Deno.test("splitForGateway: abatimento igual à perna zera o parceiro e vira 'sem split' (100% master)", () => {
  const rules = buildSplit({
    chargedCents: 10000, baseCents: 10000, takeRateBps: 2000,
    moveparkRecipientId: "re_mp", partnerRecipientId: "re_p",
  });
  assertEquals(splitForGateway(rules, 8000, "re_mp"), undefined);
  assertEquals(splitForGateway(rules, 99999, "re_mp"), undefined, "nunca abate mais que a perna");
});

Deno.test("splitForGateway: take_rate 0 com abatimento cria a perna da Movepark e ela vira liable", () => {
  const rules = buildSplit({
    chargedCents: 10000, baseCents: 10000, takeRateBps: 0,
    moveparkRecipientId: "re_mp", partnerRecipientId: "re_p",
  });
  const out = splitForGateway(rules, 4000, "re_mp")!;
  assertEquals(out.map((r) => [r.role, r.amount, r.liable]), [["partner", 6000, false], ["movepark", 4000, true]]);
});

Deno.test("maxDebtRecoveryCents: o teto é a perna normal do parceiro (decisão 4: até 100%)", () => {
  const rules = buildSplit({
    chargedCents: 11290, baseCents: 10000, takeRateBps: 2000,
    moveparkRecipientId: "re_mp", partnerRecipientId: "re_p",
  });
  assertEquals(maxDebtRecoveryCents(rules), 8000);
});

Deno.test("refundSplitToMaster: uma regra só, no master, com o valor do estorno", () => {
  const s = refundSplitToMaster("re_mp", 20000);
  assertEquals(s.length, 1);
  assertEquals([s[0].recipientId, s[0].amount, s[0].liable, s[0].role], ["re_mp", 20000, true, "movepark"]);
  assertThrows(() => refundSplitToMaster("", 100));
  assertThrows(() => refundSplitToMaster("re_mp", 0));
});
