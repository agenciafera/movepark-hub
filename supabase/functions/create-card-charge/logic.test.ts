import { assertEquals } from "jsr:@std/assert";
import {
  buildCardItems,
  buildFareUpgradeItems,
  buildDateChangeItems,
  cardFieldMessage,
  clientIp,
  extractCardId,
  parseBillingAddress,
  parseCardInput,
  parseFareUpgrade,
  reaisToCents,
} from "./logic.ts";

Deno.test("reaisToCents arredonda corretamente", () => {
  assertEquals(reaisToCents(159.5), 15950);
  assertEquals(reaisToCents(0.1), 10);
});

Deno.test("parseCardInput: exige booking_code e installments>=1", () => {
  assertEquals(parseCardInput({}).error, "booking_code é obrigatório.");
  assertEquals(parseCardInput({ booking_code: "MP-1" }).error, "installments inválido.");
  assertEquals(parseCardInput({ booking_code: "MP-1", installments: 0 }).error, "installments inválido.");
});

Deno.test("parseCardInput: exige card_token OU payment_method_id (não ambos)", () => {
  assertEquals(
    parseCardInput({ booking_code: "MP-1", installments: 1 }).error,
    "Informe card_token (cartão novo) ou payment_method_id (salvo).",
  );
  assertEquals(
    parseCardInput({ booking_code: "MP-1", installments: 1, card_token: "t", payment_method_id: "p" }).error,
    "Use card_token OU payment_method_id, não os dois.",
  );
});

Deno.test("parseCardInput: cartão novo válido normaliza os campos", () => {
  const { input } = parseCardInput({
    booking_code: " MP-9 ",
    installments: 3,
    card_token: " token_abc ",
    save_card: true,
    holder_name: "Tony Stark",
    brand: "visa",
    last4: "1234",
    exp_month: 12,
    exp_year: 2030,
    billing_address: { zip_code: "80020-310", line_1: "123, Rua XV, Centro", city: "Curitiba", state: "pr" },
  });
  assertEquals(input, {
    bookingCode: "MP-9",
    cardToken: "token_abc",
    paymentMethodId: null,
    installments: 3,
    saveCard: true,
    billingAddress: { zip_code: "80020310", line_1: "123, Rua XV, Centro", city: "Curitiba", state: "PR", country: "BR" },
    dateChange: null,
    fareUpgrade: null,
    card: { holderName: "Tony Stark", brand: "visa", last4: "1234", expMonth: 12, expYear: 2030 },
  });
});

Deno.test("parseCardInput: cartão salvo usa payment_method_id", () => {
  const { input } = parseCardInput({ booking_code: "MP-2", installments: 1, payment_method_id: "pm_1" });
  assertEquals(input?.paymentMethodId, "pm_1");
  assertEquals(input?.cardToken, null);
});

Deno.test("buildCardItems: sem juros → uma linha; com juros → linha extra; soma == cobrado", () => {
  const noInterest = buildCardItems("MP-1", 10000, 0);
  assertEquals(noInterest.length, 1);
  assertEquals(noInterest[0].amount, 10000);

  const withInterest = buildCardItems("MP-1", 10000, 1500);
  assertEquals(withInterest.length, 2);
  assertEquals(withInterest[0].amount + withInterest[1].amount, 11500);
  assertEquals(withInterest[1].description, "Juros do parcelamento");
});

Deno.test("extractCardId: lê charges[0].last_transaction.card.id; defensivo", () => {
  assertEquals(
    extractCardId({ charges: [{ last_transaction: { card: { id: "card_123" } } }] }),
    "card_123",
  );
  assertEquals(extractCardId({ mock: true }), null);
  assertEquals(extractCardId(null), null);
});

Deno.test("parseBillingAddress: normaliza CEP e UF, exige número/rua e cidade", () => {
  const ok = parseBillingAddress({ zip_code: "80020-310", line_1: "123, Rua XV, Centro", line_2: "sala 4", city: "Curitiba", state: "pr", country: "BR" });
  assertEquals(ok.address, { zip_code: "80020310", line_1: "123, Rua XV, Centro", line_2: "sala 4", city: "Curitiba", state: "PR", country: "BR" });
  assertEquals(parseBillingAddress({ zip_code: "800", line_1: "x", city: "C", state: "PR" }).address, null);
  assertEquals(parseBillingAddress({ zip_code: "80020310", line_1: "", city: "C", state: "PR" }).address, null);
  assertEquals(parseBillingAddress({ zip_code: "80020310", line_1: "1, R", city: "", state: "PR" }).address, null);
  assertEquals(parseBillingAddress(null), { address: null });
});

Deno.test("parseCardInput: cartão novo exige endereço de cobrança; cartão salvo não", () => {
  const semEndereco = parseCardInput({ booking_code: "MP-1", installments: 1, card_token: "tok" });
  assertEquals(semEndereco.input, null);
  const com = parseCardInput({ booking_code: "MP-1", installments: 1, card_token: "tok", billing_address: { zip_code: "80020310", line_1: "1, Rua", city: "Curitiba", state: "PR" } });
  assertEquals(com.input?.billingAddress?.zip_code, "80020310");
  const salvo = parseCardInput({ booking_code: "MP-1", installments: 1, payment_method_id: "pm_1" });
  assertEquals(salvo.input?.billingAddress, null);
});

Deno.test("cardFieldMessage: diz ao cliente o que corrigir", () => {
  assertEquals(
    cardFieldMessage("cvv"),
    "O código de segurança (CVV) não confere. Confira os 3 dígitos no verso do cartão (4 na frente, no Amex).",
  );
  assertEquals(cardFieldMessage("expiry"), "A validade do cartão não confere. Confira o mês e o ano (MM/AA).");
});

Deno.test("clientIp: lê o IP do comprador dos cabeçalhos de encaminhamento", () => {
  assertEquals(clientIp(new Headers({ "cf-connecting-ip": "200.150.10.20" })), "200.150.10.20");
  assertEquals(clientIp(new Headers({ "x-forwarded-for": "177.10.1.2, 10.0.0.1" })), "177.10.1.2");
  assertEquals(clientIp(new Headers({ "x-forwarded-for": "2804:14c::1" })), "2804:14c::1");
  assertEquals(clientIp(new Headers({ "x-forwarded-for": "lixo" })), null);
  assertEquals(clientIp(new Headers()), null);
});

// 17/11/2026: diferença de troca de datas paga no cartão, pelo mesmo caminho do checkout.
Deno.test("date_change: datas válidas e a diferença vista na prévia são obrigatórias", () => {
  const base = { booking_code: "MP-1", installments: 1, payment_method_id: "pm-1" };
  const ok = parseCardInput({ ...base, date_change: { check_in_at: "2027-01-10T12:00:00Z", check_out_at: "2027-01-14T12:00:00Z", expected_delta_cents: 5400 } });
  assertEquals(ok.input?.dateChange, { checkInAt: "2027-01-10T12:00:00.000Z", checkOutAt: "2027-01-14T12:00:00.000Z", expectedDeltaCents: 5400 });
  assertEquals(parseCardInput(base).input?.dateChange, null);
  assertEquals(parseCardInput({ ...base, date_change: { check_in_at: "2027-01-10T12:00:00Z", check_out_at: "2027-01-14T12:00:00Z" } }).error,
    "expected_delta_cents é obrigatório (centavos da diferença a pagar).");
  assertEquals(parseCardInput({ ...base, date_change: { check_in_at: "2027-01-14T12:00:00Z", check_out_at: "2027-01-10T12:00:00Z", expected_delta_cents: 1 } }).error,
    "Check-out precisa ser após o check-in.");
  assertEquals(parseCardInput({ ...base, date_change: { check_in_at: "2027-01-10T12:00:00Z", check_out_at: "2027-01-14T12:00:00Z", expected_delta_cents: -100 } }).error,
    "expected_delta_cents é obrigatório (centavos da diferença a pagar).");
});

Deno.test("itens da diferença de datas: a diferença + juros, somando o cobrado", () => {
  const itens = buildDateChangeItems("MP-ABC123", 5400, 312);
  assertEquals(itens[0], { amount: 5400, description: "Alteração de datas · MP-ABC123", quantity: 1 });
  assertEquals(itens.reduce((a, i) => a + i.amount, 0), 5712);
});

// Upgrade de tarifa no cartão (reunião de 26/11/2026): PIX e cartão, sem parcelamento.
const CARTAO = { booking_code: "MP-1", payment_method_id: "pm_1" };

Deno.test("parseCardInput: fare_upgrade à vista passa, com a tarifa e a diferença vista na tabela", () => {
  const { input, error } = parseCardInput({
    ...CARTAO,
    installments: 1,
    fare_upgrade: { target_tier: "flex", expected_delta_cents: 1290 },
  });
  assertEquals(error, undefined);
  assertEquals(input?.fareUpgrade, { targetTier: "flex", expectedDeltaCents: 1290 });
  assertEquals(input?.dateChange, null);
});

Deno.test("parseCardInput: o upgrade não parcela (2x é recusado)", () => {
  assertEquals(
    parseCardInput({ ...CARTAO, installments: 2, fare_upgrade: { target_tier: "superflex", expected_delta_cents: 2490 } }).error,
    "O upgrade de tarifa no cartão é à vista.",
  );
});

Deno.test("parseCardInput: upgrade e troca de datas na mesma cobrança, não", () => {
  assertEquals(
    parseCardInput({
      ...CARTAO,
      installments: 1,
      fare_upgrade: { target_tier: "flex", expected_delta_cents: 1290 },
      date_change: { check_in_at: "2027-01-01T10:00:00Z", check_out_at: "2027-01-03T10:00:00Z", expected_delta_cents: 500 },
    }).error,
    "Use date_change OU fare_upgrade, não os dois.",
  );
});

Deno.test("parseFareUpgrade: sem downgrade para a Básica e diferença obrigatória", () => {
  assertEquals(parseFareUpgrade(null), { value: null });
  assertEquals(parseFareUpgrade({ target_tier: "basica", expected_delta_cents: 100 }).error, "target_tier inválido.");
  assertEquals(
    parseFareUpgrade({ target_tier: "flex" }).error,
    "expected_delta_cents é obrigatório (centavos da diferença a pagar).",
  );
  assertEquals(parseFareUpgrade({ target_tier: "flex", expected_delta_cents: 0 }).error !== undefined, true);
});

Deno.test("buildFareUpgradeItems: uma linha só, sem juros, soma igual à cobrança", () => {
  assertEquals(buildFareUpgradeItems("MP-1", "Flex", 1290), [
    { amount: 1290, description: "Upgrade Tarifa Flex · MP-1", quantity: 1 },
  ]);
});
