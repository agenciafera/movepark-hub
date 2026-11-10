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

Deno.test("withdrawCap: a taxa sai de dentro do valor pedido; o que vai ao banco é valor menos taxa", () => {
  const base = { availableCents: 5000, feeCents: 367, gatewayAvailableCents: 12849, isHubAdmin: false, force: false };
  const tudo = withdrawCap({ ...base, amountCents: 5000 });
  assertEquals(tudo.ok, true, "disponível inteiro pode ser pedido");
  if (tudo.ok) assertEquals(tudo.toBankCents, 4633, "cai na conta o valor menos a taxa");
  assertEquals(withdrawCap({ ...base, amountCents: 5001 }).ok, false, "acima do disponível nosso");
  assertEquals(withdrawCap({ ...base, amountCents: 367 }).ok, false, "valor igual à taxa não sobra nada");
  assertEquals(withdrawCap({ ...base, amountCents: 5000, gatewayAvailableCents: 4999 }).ok, false, "gateway não cobre");
  assertEquals(withdrawCap({ ...base, amountCents: 6000, isHubAdmin: true, force: false }).ok, false, "hub_admin sem force respeita o teto");
  assertEquals(withdrawCap({ ...base, amountCents: 6000, isHubAdmin: true, force: true }).ok, true);
});

Deno.test("withdrawCap: taxa da Movepark manda o valor inteiro quando o gateway cobre valor + taxa", () => {
  // Abbapark em 10/11/2026: disponível 116152, gateway 224684. Saiu 115785; o certo é 116152.
  const abba = withdrawCap({ amountCents: 116152, availableCents: 116152, feeCents: 367, gatewayAvailableCents: 224684, isHubAdmin: false, force: false, feeBorneBy: "movepark" });
  assertEquals(abba.ok && abba.toBankCents, 116152);
  const justo = withdrawCap({ amountCents: 5000, availableCents: 5000, feeCents: 367, gatewayAvailableCents: 5367, isHubAdmin: false, force: false, feeBorneBy: "movepark" });
  assertEquals(justo.ok && justo.toBankCents, 5000, "gateway cobre exatamente valor + taxa");
  const curto = withdrawCap({ amountCents: 5000, availableCents: 5000, feeCents: 367, gatewayAvailableCents: 5366, isHubAdmin: false, force: false, feeBorneBy: "movepark" });
  assertEquals(curto.ok && curto.toBankCents, 4633, "sem folga no gateway, a taxa sai de dentro e volta pelo crédito");
  const manual = withdrawCap({ amountCents: 5000, availableCents: 5000, feeCents: 367, gatewayAvailableCents: 224684, isHubAdmin: false, force: false, feeBorneBy: "partner" });
  assertEquals(manual.ok && manual.toBankCents, 4633, "saque manual: taxa do parceiro, sempre de dentro");
});
