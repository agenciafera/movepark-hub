import { assertEquals, assertThrows } from "jsr:@std/assert";
import { buildSplit } from "./split.ts";

Deno.test("buildSplit: comissão + parceiro somam o total; parceiro absorve taxas", () => {
  const rules = buildSplit({
    totalCents: 10000,
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
  // parceiro absorve taxa/risco
  assertEquals(partner.liable, true);
  assertEquals(partner.chargeProcessingFee, true);
  assertEquals(partner.chargeRemainderFee, true);
  assertEquals(mp.liable, false);
  assertEquals(mp.chargeProcessingFee, false);
});

Deno.test("buildSplit: take_rate 0 → só a perna do parceiro", () => {
  const rules = buildSplit({
    totalCents: 5000,
    takeRateBps: 0,
    moveparkRecipientId: "",
    partnerRecipientId: "rp_partner",
  });
  assertEquals(rules.length, 1);
  assertEquals(rules[0].amount, 5000);
});

Deno.test("buildSplit: comissão exige recebedor master configurado", () => {
  assertThrows(() =>
    buildSplit({ totalCents: 10000, takeRateBps: 1500, moveparkRecipientId: "", partnerRecipientId: "rp_partner" })
  );
});

Deno.test("buildSplit: rejeita parceiro ausente e valor inválido", () => {
  assertThrows(() =>
    buildSplit({ totalCents: 10000, takeRateBps: 1500, moveparkRecipientId: "rp_mp", partnerRecipientId: "" })
  );
  assertThrows(() =>
    buildSplit({ totalCents: 0, takeRateBps: 1500, moveparkRecipientId: "rp_mp", partnerRecipientId: "rp_partner" })
  );
});
