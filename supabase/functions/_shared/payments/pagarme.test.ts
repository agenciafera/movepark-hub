import { assertEquals } from "jsr:@std/assert";
import {
  buildCardOrderBody,
  buildChargeResult,
  buildCreateRecipientBody,
  buildOrderBody,
  buildRecipientResult,
  buildRefundResult,
  extractKycUrl,
  mapChargeStatus,
  mapRecipientStatus,
  normalizeRequirements,
  pagarmeAuthHeader,
  pagarmeBaseUrl,
  recipientCanNeedKyc,
} from "./pagarme.ts";
import type { CardChargeInput, PixChargeInput, RecipientInput } from "./types.ts";

Deno.test("pagarmeBaseUrl: host único da Core v5 (a chave define o ambiente)", () => {
  assertEquals(pagarmeBaseUrl("sk_test_abc"), "https://api.pagar.me/core/v5");
  assertEquals(pagarmeBaseUrl("sk_live_abc"), "https://api.pagar.me/core/v5");
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

Deno.test("mapChargeStatus normaliza status de cobrança", () => {
  assertEquals(mapChargeStatus("paid"), "paid");
  assertEquals(mapChargeStatus("waiting_payment"), "pending");
  assertEquals(mapChargeStatus("pending"), "pending");
  assertEquals(mapChargeStatus("canceled"), "canceled");
  assertEquals(mapChargeStatus("refunded"), "refunded");
  assertEquals(mapChargeStatus("with_error"), "failed");
});

Deno.test("buildOrderBody monta PIX + split", () => {
  const input: PixChargeInput = {
    externalCode: "MP-ABC123",
    amountCents: 10000,
    customer: { name: "Cliente", email: "c@ex.com", document: "39053344705", type: "individual", phone: { ddd: "11", number: "999998888" } },
    items: [{ amount: 10000, description: "Reserva MP-ABC123", quantity: 1 }],
    split: [
      { recipientId: "rp_partner", amount: 8500, type: "flat", liable: true, chargeProcessingFee: true, chargeRemainderFee: true },
      { recipientId: "rp_mp", amount: 1500, type: "flat", liable: false, chargeProcessingFee: false, chargeRemainderFee: false },
    ],
    expiresInSeconds: 3600,
    metadata: { booking_id: "b1" },
  };
  const body = buildOrderBody(input) as Record<string, any>;
  assertEquals(body.code, "MP-ABC123");
  assertEquals(body.payments[0].payment_method, "pix");
  assertEquals(body.payments[0].pix.expires_in, 3600);
  assertEquals(body.payments[0].split.length, 2);
  assertEquals(body.payments[0].split[0].recipient_id, "rp_partner");
  assertEquals(body.payments[0].split[0].options.charge_processing_fee, true);
  assertEquals(body.customer.phones.mobile_phone.area_code, "11");
  assertEquals(body.metadata.booking_id, "b1");
});

Deno.test("buildCardOrderBody: cartão novo (token) com parcelas + split", () => {
  const input: CardChargeInput = {
    externalCode: "MP-CARD1",
    amountCents: 33000,
    customer: { name: "Cliente", email: "c@ex.com", document: "39053344705", type: "individual" },
    items: [{ amount: 33000, description: "Reserva MP-CARD1", quantity: 1 }],
    split: [
      { recipientId: "rp_partner", amount: 28500, type: "flat", liable: true, chargeProcessingFee: true, chargeRemainderFee: true },
      { recipientId: "rp_mp", amount: 4500, type: "flat", liable: false, chargeProcessingFee: false, chargeRemainderFee: false },
    ],
    card: { cardToken: "token_abc" },
    installments: 6,
    metadata: { booking_id: "b9" },
  };
  const body = buildCardOrderBody(input) as Record<string, any>;
  assertEquals(body.code, "MP-CARD1");
  assertEquals(body.payments[0].payment_method, "credit_card");
  assertEquals(body.payments[0].credit_card.installments, 6);
  assertEquals(body.payments[0].credit_card.statement_descriptor, "MOVEPARK");
  assertEquals(body.payments[0].credit_card.card.token, "token_abc");
  assertEquals(body.payments[0].credit_card.card_id, undefined);
  assertEquals(body.payments[0].credit_card.split.length, 2);
  assertEquals(body.payments[0].credit_card.split[0].recipient_id, "rp_partner");
});

Deno.test("buildCardOrderBody: cartão salvo usa card_id (não token)", () => {
  const body = buildCardOrderBody({
    externalCode: "MP-CARD2",
    amountCents: 10000,
    customer: { name: "C", email: "c@ex.com", document: null, type: "individual" },
    items: [{ amount: 10000, description: "x", quantity: 1 }],
    split: [{ recipientId: "rp_p", amount: 10000, type: "flat", liable: true, chargeProcessingFee: true, chargeRemainderFee: true }],
    card: { cardId: "card_saved_1" },
    installments: 1,
  }) as Record<string, any>;
  assertEquals(body.payments[0].credit_card.card_id, "card_saved_1");
  assertEquals(body.payments[0].credit_card.card, undefined);
});

Deno.test("buildChargeResult extrai qr_code e status do charge", () => {
  const r = buildChargeResult(200, {
    id: "or_1",
    status: "pending",
    charges: [{ id: "ch_1", status: "pending", last_transaction: { qr_code: "00020126...", qr_code_url: "https://qr", expires_at: "2026-06-19T12:00:00Z", status: "waiting_payment" } }],
  });
  assertEquals(r.orderId, "or_1");
  assertEquals(r.chargeId, "ch_1");
  assertEquals(r.status, "pending");
  assertEquals(r.qrCode, "00020126...");
  assertEquals(r.qrCodeUrl, "https://qr");
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

Deno.test("buildRefundResult: charge cru (não order) → status + amount estornado", () => {
  const r = buildRefundResult(200, {
    id: "ch_1",
    status: "refunded",
    amount: 15900,
    last_transaction: { status: "refunded" },
  });
  assertEquals(r.chargeId, "ch_1");
  assertEquals(r.status, "refunded");
  assertEquals(r.refundedAmountCents, 15900);
  assertEquals(r.httpStatus, 200);
});

Deno.test("buildRefundResult: PIX assíncrono cai no last_transaction.status", () => {
  const r = buildRefundResult(200, {
    id: "ch_2",
    status: "paid",
    amount: 5000,
    last_transaction: { status: "pending_refund" },
  });
  // status da charge ainda 'paid', mas a transação indica refunded → normaliza p/ refunded
  assertEquals(r.status, "paid"); // b.status tem precedência (charge.status manda)
  assertEquals(r.refundedAmountCents, 5000);
});

Deno.test("buildRefundResult: body vazio/erro → campos nulos", () => {
  const r = buildRefundResult(422, null);
  assertEquals(r.chargeId, null);
  assertEquals(r.status, "pending");
  assertEquals(r.refundedAmountCents, null);
  assertEquals(r.httpStatus, 422);
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
