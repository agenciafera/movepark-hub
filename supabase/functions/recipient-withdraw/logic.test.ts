import { assertEquals } from "jsr:@std/assert";
import { parseWithdrawInput, withdrawCap, withdrawPreflight } from "./logic.ts";

Deno.test("parseWithdrawInput: exige uuid e inteiro positivo em centavos", () => {
  assertEquals(parseWithdrawInput({ company_id: "x", amount_cents: 100 }).input, null);
  assertEquals(parseWithdrawInput({ company_id: "d5337b66-7fab-4704-b746-26654024ae25", amount_cents: 0 }).input, null);
  assertEquals(parseWithdrawInput({ company_id: "d5337b66-7fab-4704-b746-26654024ae25", amount_cents: 12.5 }).input, null);
  assertEquals(
    parseWithdrawInput({ company_id: "d5337b66-7fab-4704-b746-26654024ae25", amount_cents: 5000 }).input,
    { companyId: "d5337b66-7fab-4704-b746-26654024ae25", amountCents: 5000, force: false },
  );
});

Deno.test("withdrawPreflight: leitura ruim aborta em 502, saldo curto em 409, saldo exato passa", () => {
  assertEquals(withdrawPreflight({ httpStatus: 500, availableCents: null }, 100).ok, false);
  const curto = withdrawPreflight({ httpStatus: 200, availableCents: 99 }, 100);
  assertEquals(curto.ok, false);
  if (!curto.ok) assertEquals(curto.status, 409);
  assertEquals(withdrawPreflight({ httpStatus: 200, availableCents: 100 }, 100).ok, true);
});

Deno.test("withdrawCap: parceiro para no teto nosso (com a taxa); hub_admin passa só com force e até o gateway", () => {
  const base = { amountCents: 6000, availableCents: 5000, feeCents: 367, gatewayAvailableCents: 12849 };
  assertEquals(withdrawCap({ ...base, amountCents: 4633, isHubAdmin: false, force: false }).ok, true, "valor + taxa = disponível");
  assertEquals(withdrawCap({ ...base, amountCents: 5000, isHubAdmin: false, force: false }).ok, false, "a taxa não cabe");
  assertEquals(withdrawCap({ ...base, isHubAdmin: false, force: true }).ok, false, "parceiro não força");
  assertEquals(withdrawCap({ ...base, isHubAdmin: true, force: false }).ok, false, "hub_admin sem force respeita o teto");
  assertEquals(withdrawCap({ ...base, isHubAdmin: true, force: true }).ok, true);
  assertEquals(withdrawCap({ ...base, amountCents: 20000, isHubAdmin: true, force: true }).ok, false, "nem com force passa do gateway");
});
