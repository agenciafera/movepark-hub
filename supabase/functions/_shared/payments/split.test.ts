import { assertEquals, assertThrows } from "jsr:@std/assert";
import { buildSplit } from "./split.ts";

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
  assertEquals(partner.liable, true);
  assertEquals(partner.chargeProcessingFee, true);
  assertEquals(partner.chargeRemainderFee, true);
  assertEquals(mp.liable, false);
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
