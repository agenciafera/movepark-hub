import { assertEquals } from "jsr:@std/assert";
import { parseGatewaySettings } from "./settings.ts";

Deno.test("parseGatewaySettings: lê as três chaves e mantém o cru", () => {
  const s = parseGatewaySettings([
    { key: "pagarme_movepark_recipient_id", value: " re_master " },
    { key: "pagarme_split_enabled", value: "true" },
    { key: "pagarme_master_float_cents", value: "300000" },
    { key: "card_installment_policy", value: "{}" },
  ]);
  assertEquals(s.moveparkRecipientId, "re_master");
  assertEquals(s.splitEnabled, true);
  assertEquals(s.masterFloatCents, 300000);
  assertEquals(s.raw.card_installment_policy, "{}");
});

Deno.test("parseGatewaySettings: sem chave o split fica LIGADO e o colchão é zero", () => {
  const s = parseGatewaySettings([]);
  assertEquals(s.splitEnabled, true);
  assertEquals(s.masterFloatCents, 0);
  assertEquals(s.moveparkRecipientId, "");
});

Deno.test("parseGatewaySettings: colchão inválido ou negativo vira zero, nunca NaN", () => {
  assertEquals(parseGatewaySettings([{ key: "pagarme_master_float_cents", value: "abc" }]).masterFloatCents, 0);
  assertEquals(parseGatewaySettings([{ key: "pagarme_master_float_cents", value: "-5" }]).masterFloatCents, 0);
  assertEquals(parseGatewaySettings([{ key: "pagarme_split_enabled", value: "false" }]).splitEnabled, false);
});
