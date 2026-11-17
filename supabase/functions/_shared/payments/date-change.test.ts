import { assertEquals } from "jsr:@std/assert";
import {
  chargeSplitBase,
  type DateChangeQuote,
  nextPartnerRefundFrac,
  partnerLegCents,
  partnerShareOfRefundCents,
  quoteView,
} from "./date-change.ts";
import { buildSplit, partnerRule } from "./split.ts";

const q = (over: Partial<DateChangeQuote>): DateChangeQuote => ({
  booking_id: "b1", days: 3, days_before: 5, price_source: "compra",
  current_total_cents: 15740, new_total_cents: 9960, delta_cents: -5780,
  partner_base_delta_cents: -5780, available: true, reason: null, ...over,
});

Deno.test("estorno de 2 diárias (R$ 57,80, comissão 15%): sai R$ 49,13 do estacionamento", () => {
  // O exemplo que o Kallef aprovou em 17/11/2026: a tarifa não entra, e a conta é a da divisão.
  assertEquals(partnerShareOfRefundCents(-5780, 1500), 4913);
  assertEquals(partnerShareOfRefundCents(5780, 0), 5780);
  assertEquals(partnerShareOfRefundCents(5780, 10000), 0);
});

Deno.test("a parte do estacionamento no estorno é a mesma conta da divisão da cobrança", () => {
  for (const [base, bps] of [[5780, 1500], [3780, 2000], [12345, 1750], [99, 1500]]) {
    const regras = buildSplit({
      chargedCents: base, baseCents: base, takeRateBps: bps, moveparkRecipientId: "m", partnerRecipientId: "p",
      requireRecipients: false, method: "pix",
    });
    assertEquals(partnerShareOfRefundCents(base, bps), partnerRule(regras)!.amount, `base ${base}, ${bps}`);
  }
});

Deno.test("fração acumulada da perna devolvida, com teto 1", () => {
  assertEquals(nextPartnerRefundFrac(0, 4913, 12283), 4913 / 12283);
  assertEquals(nextPartnerRefundFrac(0.9, 5000, 10000), 1);
  assertEquals(nextPartnerRefundFrac(0.2, 100, 0), 0.2);
});

Deno.test("perna do parceiro gravada: por role, e as antigas por liable", () => {
  assertEquals(partnerLegCents([{ role: "partner", amount: 12283 }, { role: "movepark", amount: 3457 }]), 12283);
  assertEquals(partnerLegCents([{ liable: true, amount: 100 }, { liable: false, amount: 50 }]), 100);
  assertEquals(partnerLegCents(null), 0);
});

Deno.test("base da divisão da diferença: a própria diferença; cupom da Movepark volta para o estacionamento", () => {
  assertEquals(chargeSplitBase(q({ delta_cents: 5400, partner_base_delta_cents: 5400 })), { chargedCents: 5400, baseCents: 5400, platformFundedCents: 0 });
  assertEquals(chargeSplitBase(q({ delta_cents: 5400, partner_base_delta_cents: 6000 })), { chargedCents: 5400, baseCents: 5400, platformFundedCents: 600 });
});

Deno.test("cotação para a tela: efeito no dinheiro em reais", () => {
  assertEquals(quoteView(q({})).effect, "refund");
  assertEquals(quoteView(q({})).delta, -57.8);
  assertEquals(quoteView(q({ delta_cents: 2570 })).effect, "charge");
  assertEquals(quoteView(q({ delta_cents: 0 })).effect, "none");
  assertEquals(quoteView(q({ delta_cents: null, new_total_cents: null, available: false, reason: "Nesta unidade o mínimo é de 3 diárias." })).effect, null);
});
