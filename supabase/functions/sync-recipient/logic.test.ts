import { assertEquals } from "jsr:@std/assert";
import {
  accountToRecipientInput,
  gatewayErrorMessage,
  maskTail,
  parseSyncInput,
  redactRecipientBody,
  type PayoutAccountRow,
} from "./logic.ts";

Deno.test("gatewayErrorMessage: extrai message + errors por campo", () => {
  assertEquals(
    gatewayErrorMessage({
      message: "The request is invalid.",
      errors: {
        "default_bank_account.account_number": ["required"],
        "register_information.annual_revenue": ["required"],
      },
    }),
    "The request is invalid. · default_bank_account.account_number: required · register_information.annual_revenue: required",
  );
});

Deno.test("gatewayErrorMessage: errors como array de objetos", () => {
  assertEquals(
    gatewayErrorMessage({ errors: [{ message: "CPF do representante inválido" }] }),
    "CPF do representante inválido",
  );
});

Deno.test("gatewayErrorMessage: sem nada útil → null", () => {
  assertEquals(gatewayErrorMessage(null), null);
  assertEquals(gatewayErrorMessage({}), null);
  assertEquals(gatewayErrorMessage("erro"), null);
});

Deno.test("parseSyncInput valida company_id e action", () => {
  assertEquals(parseSyncInput(null).error !== undefined, true);
  assertEquals(parseSyncInput({ action: "create" }).error !== undefined, true);
  assertEquals(parseSyncInput({ company_id: "c1", action: "nope" }).error !== undefined, true);
  assertEquals(parseSyncInput({ company_id: "c1", action: "create" }).input, {
    company_id: "c1",
    action: "create",
    provider: "pagarme",
  });
  assertEquals(parseSyncInput({ company_id: "c1", action: "refresh", provider: "mock" }).input, {
    company_id: "c1",
    action: "refresh",
    provider: "mock",
  });
});

Deno.test("accountToRecipientInput mapeia banco/KYC para o input agnóstico", () => {
  const account: PayoutAccountRow = {
    legal_name: "X LTDA",
    document: "123",
    document_type: "cnpj",
    bank_code: "341",
    branch_number: "1",
    branch_check_digit: "2",
    account_number: "3",
    account_check_digit: "4",
    account_type: "checking",
    holder_name: "X",
    holder_document: "123",
    kyc_details: { email: "kyc@b.co", representative: { name: "Rep" } },
  };
  const input = accountToRecipientInput("comp-1", account, "a@b.co");
  assertEquals(input.externalCode, "comp-1");
  assertEquals(input.email, "kyc@b.co"); // kyc_details.email tem prioridade
  assertEquals(input.bank.code, "341");
  assertEquals(input.bank.type, "checking");
  assertEquals(input.documentType, "cnpj");
  assertEquals(input.kyc?.representative?.name, "Rep");
});

Deno.test("maskTail mantém só os últimos dígitos", () => {
  assertEquals(maskTail("12345678", 4), "****5678");
  assertEquals(maskTail("12", 4), "**");
  assertEquals(maskTail(null), null);
  assertEquals(maskTail(123 as unknown as string), null);
});

Deno.test("redactRecipientBody mascara documento e número de conta", () => {
  const body = {
    code: "c1",
    register_information: { document: "12345678000199" },
    default_bank_account: { holder_document: "12345678000199", account_number: "67890", bank: "341" },
  };
  const out = redactRecipientBody(body) as Record<string, any>;
  assertEquals(out.code, "c1");
  assertEquals(out.register_information.document, "**********0199");
  assertEquals(out.default_bank_account.account_number, "*7890");
  assertEquals(out.default_bank_account.bank, "341"); // não sensível, intacto
});
