import { assertEquals } from "jsr:@std/assert";
import { buildCardItems, extractCardId, parseCardInput, reaisToCents } from "./logic.ts";

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
  });
  assertEquals(input, {
    bookingCode: "MP-9",
    cardToken: "token_abc",
    paymentMethodId: null,
    installments: 3,
    saveCard: true,
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
