import { assertEquals } from "jsr:@std/assert";
import {
  accountToRecipientInput,
  gatewayErrorMessage,
  maskTail,
  parseSyncInput,
  redactRecipientBody,
  shouldReissueKycLink,
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

Deno.test("parseSyncInput aceita reissue_kyc", () => {
  const { input, error } = parseSyncInput({ company_id: "c1", action: "reissue_kyc" });
  assertEquals(error, undefined);
  assertEquals(input?.action, "reissue_kyc");
});

Deno.test("parseSyncInput recusa action desconhecida", () => {
  const { error } = parseSyncInput({ company_id: "c1", action: "explode" });
  assertEquals(typeof error, "string");
});

const NOW = new Date("2026-07-30T20:30:00Z");

Deno.test("shouldReissueKycLink: link vivo é reaproveitado", () => {
  // Emitir outro invalidaria o que o parceiro talvez já tenha aberto no celular.
  assertEquals(
    shouldReissueKycLink({
      expiresAt: "2026-07-30T20:46:41Z",
      lastIssuedAt: "2026-07-30T20:26:41Z",
      now: NOW,
    }),
    "serve_existing",
  );
});

Deno.test("shouldReissueKycLink: expirado mas emitido agora há pouco segura", () => {
  assertEquals(
    shouldReissueKycLink({
      expiresAt: "2026-07-30T20:29:00Z",
      lastIssuedAt: "2026-07-30T20:29:30Z",
      now: NOW,
    }),
    "cooldown",
  );
});

Deno.test("shouldReissueKycLink: expirado e fora do cooldown reemite", () => {
  assertEquals(
    shouldReissueKycLink({
      expiresAt: "2026-07-30T20:10:00Z",
      lastIssuedAt: "2026-07-30T19:50:00Z",
      now: NOW,
    }),
    "reissue",
  );
});

Deno.test("shouldReissueKycLink: sem link nenhum reemite", () => {
  assertEquals(
    shouldReissueKycLink({ expiresAt: null, lastIssuedAt: null, now: NOW }),
    "reissue",
  );
});

Deno.test("shouldReissueKycLink: validade ilegível não trava o parceiro", () => {
  assertEquals(
    shouldReissueKycLink({ expiresAt: "qualquer coisa", lastIssuedAt: null, now: NOW }),
    "reissue",
  );
});

