import { assertEquals } from "jsr:@std/assert";
import { anticipationFeesByRecipient, estimateAnticipationCompCents } from "./anticipation.ts";

const base = { partnerMdrCents: 0, monthlyRateBps: 310, marginDays: 4 };

Deno.test("3x de R$ 120 com 3,1% ao mês: compensação de R$ 4,37 (exemplo da spec)", () => {
  assertEquals(estimateAnticipationCompCents({ ...base, installments: 3, partnerLegCents: 12000 }), 437);
});

Deno.test("à vista: só a margem de dias", () => {
  // f = 0,031/30 × 4 = 0,4133%; δ = ceil(10000 × f / (1 − f)) = 42
  assertEquals(estimateAnticipationCompCents({ ...base, installments: 1, partnerLegCents: 10000 }), 42);
});

Deno.test("MDR na perna do parceiro sai da base antecipada", () => {
  const sem = estimateAnticipationCompCents({ ...base, installments: 3, partnerLegCents: 12000 });
  const com = estimateAnticipationCompCents({ ...base, installments: 3, partnerLegCents: 12000, partnerMdrCents: 1000 });
  assertEquals(com < sem, true);
});

Deno.test("entrada inválida devolve zero (nunca compensação negativa)", () => {
  assertEquals(estimateAnticipationCompCents({ ...base, installments: 0, partnerLegCents: 12000 }), 0);
  assertEquals(estimateAnticipationCompCents({ ...base, installments: 3, partnerLegCents: 0 }), 0);
  assertEquals(estimateAnticipationCompCents({ ...base, installments: 3, partnerLegCents: 12000, monthlyRateBps: 0 }), 0);
});

Deno.test("12x cresce com o número de parcelas", () => {
  const tres = estimateAnticipationCompCents({ ...base, installments: 3, partnerLegCents: 12000 });
  const doze = estimateAnticipationCompCents({ ...base, installments: 12, partnerLegCents: 12000 });
  assertEquals(doze > tres, true);
});

Deno.test("taxa real por perna: soma só recebíveis de crédito", () => {
  const p = (recipientId: string, ant: number, type = "credit") => ({
    id: null,
    chargeId: null,
    recipientId,
    amountCents: 1000,
    feeCents: 0,
    anticipationFeeCents: ant,
    fraudCoverageFeeCents: 0,
    type,
    status: "paid",
    installment: 1,
    paymentDate: null,
  });
  assertEquals(
    anticipationFeesByRecipient([p("re_mp", 2), p("re_mp", 19), p("re_parc", 55), p("re_parc", -55, "refund")], "re_mp"),
    { partnerCents: 55, moveparkCents: 21 },
  );
});
