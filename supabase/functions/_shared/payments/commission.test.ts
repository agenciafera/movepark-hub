import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { chargebackDebtCents, columnsFromRpc, commissionForCharge, needsCommissionFreeze } from "./commission.ts";

Deno.test("reserva sem pacote gravado cai no padrão do Hub, com o take_rate da empresa", () => {
  assertEquals(commissionForCharge({}, 2000), {
    channel: "hub",
    ruleId: null,
    takeRateBps: 2000,
    feePayer: "movepark",
    chargebackBearer: "each",
  });
  assertEquals(needsCommissionFreeze({}), true);
  assertEquals(commissionForCharge({}, null).takeRateBps, 0);
});

Deno.test("pacote gravado vence o take_rate atual da empresa: é isso que congelado quer dizer", () => {
  const pkg = commissionForCharge(
    {
      commission_rule_id: "r1",
      commission_channel: "Site do parceiro",
      commission_take_rate_bps: 500,
      commission_fee_payer: "partner",
      commission_chargeback_bearer: "partner",
    },
    2000,
  );
  assertEquals(pkg, {
    channel: "Site do parceiro",
    ruleId: "r1",
    takeRateBps: 500,
    feePayer: "partner",
    chargebackBearer: "partner",
  });
});

Deno.test("comissão zero gravada é zero, não 'sem pacote'", () => {
  const b = { commission_channel: "Parceria", commission_take_rate_bps: 0, commission_fee_payer: "partner", commission_chargeback_bearer: "each" };
  assertEquals(needsCommissionFreeze(b), false);
  assertEquals(commissionForCharge(b, 2000).takeRateBps, 0);
});

Deno.test("valor desconhecido nas colunas cai no lado seguro (Movepark paga a taxa, cada um com o seu)", () => {
  const pkg = commissionForCharge(
    { commission_channel: "x", commission_take_rate_bps: 1000, commission_fee_payer: "lixo", commission_chargeback_bearer: null },
    2000,
  );
  assertEquals(pkg.feePayer, "movepark");
  assertEquals(pkg.chargebackBearer, "each");
});

Deno.test("columnsFromRpc lê o jsonb do banco e ignora tipo errado", () => {
  assertEquals(
    columnsFromRpc({ rule_id: "r1", channel: "Site", take_rate_bps: 500, fee_payer: "partner", chargeback_bearer: "movepark", changed: true }),
    {
      commission_rule_id: "r1",
      commission_channel: "Site",
      commission_take_rate_bps: 500,
      commission_fee_payer: "partner",
      commission_chargeback_bearer: "movepark",
    },
  );
  assertEquals(needsCommissionFreeze(columnsFromRpc(null)), true);
  assertEquals(needsCommissionFreeze(columnsFromRpc({ channel: "x", take_rate_bps: "500" })), true);
});

Deno.test("chargeback pela regra", () => {
  assertEquals(chargebackDebtCents("each", 20000, true), null, "each: o razão calcula a perna do parceiro");
  assertEquals(chargebackDebtCents(null, 20000, true), null, "reserva antiga se comporta como each");
  assertEquals(chargebackDebtCents("movepark", 20000, true), 0, "a Movepark absorve tudo");
  assertEquals(chargebackDebtCents("partner", 20000, true), 20000, "o parceiro devolve o valor inteiro");
  assertEquals(chargebackDebtCents("partner", 20000, false), null, "se o gateway já debitou o parceiro (ou custódia), não cria dívida");
});
