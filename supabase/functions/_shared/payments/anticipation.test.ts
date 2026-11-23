import { assertEquals } from "jsr:@std/assert";
import { anticipationFeesByRecipient, estimateAnticipationCompCents, estimatePartnerAnticipationFeeCents } from "./anticipation.ts";

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

// Estimativa da taxa quando o PRÓPRIO parceiro paga a antecipação (23/11/2026): sem folga e sem
// gross-up, só para a tela mostrar a taxa prevista desde a venda. Taxas inventadas.
const prevista = { partnerMdrCents: 0, monthlyRateBps: 200, marginDays: 1 };

Deno.test("parceiro pagando: 3x de R$ 120 a 2% ao mês antecipa 1, 31 e 61 dias e prevê R$ 2,48", () => {
  assertEquals(estimatePartnerAnticipationFeeCents({ ...prevista, installments: 3, partnerLegCents: 12000 }), 248);
});

Deno.test("parceiro pagando: à vista só o dia de antecipação da 1ª parcela", () => {
  assertEquals(estimatePartnerAnticipationFeeCents({ ...prevista, installments: 1, partnerLegCents: 12000 }), 8);
});

Deno.test("parceiro pagando: o MDR da perna dele sai da base", () => {
  const sem = estimatePartnerAnticipationFeeCents({ ...prevista, installments: 3, partnerLegCents: 12000 });
  const com = estimatePartnerAnticipationFeeCents({ ...prevista, installments: 3, partnerLegCents: 12000, partnerMdrCents: 1000 });
  assertEquals(com < sem, true);
});

Deno.test("parceiro pagando: entrada inválida devolve zero", () => {
  assertEquals(estimatePartnerAnticipationFeeCents({ ...prevista, installments: 0, partnerLegCents: 12000 }), 0);
  assertEquals(estimatePartnerAnticipationFeeCents({ ...prevista, installments: 3, partnerLegCents: 0 }), 0);
  assertEquals(estimatePartnerAnticipationFeeCents({ ...prevista, installments: 3, partnerLegCents: 12000, monthlyRateBps: 0 }), 0);
});
