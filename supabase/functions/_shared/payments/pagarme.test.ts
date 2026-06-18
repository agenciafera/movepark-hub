import { assertEquals } from "jsr:@std/assert";
import {
  buildCreateRecipientBody,
  buildRecipientResult,
  extractKycUrl,
  mapRecipientStatus,
  normalizeRequirements,
  pagarmeAuthHeader,
  pagarmeBaseUrl,
  recipientCanNeedKyc,
} from "./pagarme.ts";
import type { RecipientInput } from "./types.ts";

Deno.test("pagarmeBaseUrl: sandbox para sk_test_, produção caso contrário", () => {
  assertEquals(pagarmeBaseUrl("sk_test_abc"), "https://sdx-api.pagar.me/core/v5");
  assertEquals(pagarmeBaseUrl("sk_live_abc"), "https://api.pagar.me/core/v5");
  assertEquals(pagarmeBaseUrl("qualquer"), "https://api.pagar.me/core/v5");
});

Deno.test("pagarmeAuthHeader: Basic base64(secret:)", () => {
  assertEquals(pagarmeAuthHeader("sk_test_x"), "Basic " + btoa("sk_test_x:"));
});

Deno.test("mapRecipientStatus normaliza os status crus", () => {
  assertEquals(mapRecipientStatus("active"), "active");
  assertEquals(mapRecipientStatus("refused"), "refused");
  assertEquals(mapRecipientStatus("suspended"), "suspended");
  assertEquals(mapRecipientStatus("blocked"), "suspended");
  assertEquals(mapRecipientStatus("inactive"), "suspended");
  assertEquals(mapRecipientStatus("registration"), "pending");
  assertEquals(mapRecipientStatus("affiliation"), "pending");
  assertEquals(mapRecipientStatus(null), "pending");
  assertEquals(mapRecipientStatus("coisa-nova"), "pending");
});

Deno.test("normalizeRequirements aceita strings e objetos, filtra vazios", () => {
  assertEquals(normalizeRequirements(null), []);
  assertEquals(normalizeRequirements({ errors: ["faltou doc"] }), [
    { code: "requirement", message: "faltou doc" },
  ]);
  assertEquals(
    normalizeRequirements({ errors: [{ code: "bank", message: "conta inválida" }, {}] }),
    [{ code: "bank", message: "conta inválida" }],
  );
  assertEquals(normalizeRequirements({ kyc_details: { pending: ["selfie"] } }), [
    { code: "requirement", message: "selfie" },
  ]);
});

Deno.test("extractKycUrl lê kyc_url ou kyc_details.url", () => {
  assertEquals(extractKycUrl({ kyc_url: "https://x" }), "https://x");
  assertEquals(extractKycUrl({ kyc_details: { url: "https://y" } }), "https://y");
  assertEquals(extractKycUrl({}), null);
});

Deno.test("buildCreateRecipientBody: CNPJ vira corporation; CPF vira individual", () => {
  const base: RecipientInput = {
    externalCode: "company-1",
    legalName: "Estac. LTDA",
    document: "12345678000199",
    documentType: "cnpj",
    email: "a@b.co",
    bank: {
      code: "341",
      branchNumber: "1234",
      branchCheckDigit: "5",
      accountNumber: "67890",
      accountCheckDigit: "1",
      type: "checking",
    },
    holderName: "Estac. LTDA",
    holderDocument: "12345678000199",
  };
  const corp = buildCreateRecipientBody(base) as Record<string, any>;
  assertEquals(corp.code, "company-1");
  assertEquals(corp.register_information.type, "corporation");
  assertEquals(corp.register_information.company_name, "Estac. LTDA");
  assertEquals(corp.default_bank_account.bank, "341");
  assertEquals(corp.default_bank_account.holder_type, "company");

  const ind = buildCreateRecipientBody({ ...base, documentType: "cpf" }) as Record<string, any>;
  assertEquals(ind.register_information.type, "individual");
  assertEquals(ind.register_information.name, "Estac. LTDA");
  assertEquals(ind.default_bank_account.holder_type, "individual");
});

Deno.test("recipientCanNeedKyc: só pending/action_required consultam prova de vida", () => {
  assertEquals(recipientCanNeedKyc("pending"), true);
  assertEquals(recipientCanNeedKyc("action_required"), true);
  assertEquals(recipientCanNeedKyc("active"), false);
  assertEquals(recipientCanNeedKyc("refused"), false);
  assertEquals(recipientCanNeedKyc("suspended"), false);
  assertEquals(recipientCanNeedKyc("draft"), false);
});

Deno.test("buildCreateRecipientBody: PJ com KYC monta register_information completo", () => {
  const input: RecipientInput = {
    externalCode: "company-1",
    legalName: "Estac LTDA",
    document: "11222333000181",
    documentType: "cnpj",
    email: null,
    bank: {
      code: "341",
      branchNumber: "1234",
      branchCheckDigit: "5",
      accountNumber: "67890",
      accountCheckDigit: "1",
      type: "checking",
    },
    holderName: "Estac LTDA",
    holderDocument: "11222333000181",
    kyc: {
      email: "contato@estac.com",
      trade_name: "EstacioneJá",
      annual_revenue: 1000000,
      founding_date: "30/10/2010",
      corporation_type: "LTDA",
      phone: { ddd: "11", number: "999998888" },
      address: {
        zip_code: "01310930",
        street: "Av. Paulista",
        street_number: "1000",
        neighborhood: "Bela Vista",
        city: "São Paulo",
        state: "SP",
      },
      representative: {
        name: "Tony Stark",
        document: "39053344705",
        email: "tony@estac.com",
        birthdate: "12/10/1985",
        monthly_income: 12000,
        professional_occupation: "Sócio",
        self_declared_legal_representative: true,
        phone: { ddd: "11", number: "988887777" },
        address: { zip_code: "01310930", street: "Av. Paulista", street_number: "1000", city: "São Paulo", state: "SP" },
      },
    },
  };
  const body = buildCreateRecipientBody(input) as Record<string, any>;
  const reg = body.register_information;
  assertEquals(reg.type, "corporation");
  assertEquals(reg.company_name, "EstacioneJá");
  assertEquals(reg.trading_name, "Estac LTDA");
  assertEquals(reg.email, "contato@estac.com");
  assertEquals(reg.annual_revenue, 1000000);
  assertEquals(reg.founding_date, "2010-10-30"); // DD/MM/AAAA → ISO
  assertEquals(reg.main_address.zip_code, "01310930");
  assertEquals(reg.main_address.complementary, undefined);
  assertEquals(reg.phone_numbers, [{ ddd: "11", number: "999998888", type: "mobile" }]);
  assertEquals(reg.managing_partners[0].name, "Tony Stark");
  assertEquals(reg.managing_partners[0].type, "individual");
  assertEquals(reg.managing_partners[0].self_declared_legal_representative, true);
  assertEquals(body.default_bank_account.holder_type, "company");
  assertEquals(body.default_bank_account.bank, "341");
});

Deno.test("buildRecipientResult: kyc/pendências em status pending → action_required", () => {
  const r = buildRecipientResult(200, {
    id: "rp_1",
    status: "registration",
    kyc_url: "https://kyc",
  });
  assertEquals(r.externalId, "rp_1");
  assertEquals(r.status, "action_required");
  assertEquals(r.kycUrl, "https://kyc");
  assertEquals(r.httpStatus, 200);

  const active = buildRecipientResult(200, { id: "rp_2", status: "active" });
  assertEquals(active.status, "active");
});
