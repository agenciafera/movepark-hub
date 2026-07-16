import { describe, expect, it } from "vitest";
import { emptyPayoutKyc, payoutKycSchema, toPayoutAccountPayload, type PayoutKycForm } from "./kyc";

function validForm(): PayoutKycForm {
  const addr = {
    zip_code: "01310-930",
    street: "Av. Paulista",
    street_number: "1000",
    complement: "Sala 12",
    neighborhood: "Bela Vista",
    city: "São Paulo",
    state: "SP",
    reference_point: "Em frente ao MASP",
  };
  return {
    company: {
      legal_name: "Estac LTDA",
      trade_name: "EstacioneJá",
      document: "11.222.333/0001-81",
      email: "contato@estac.com",
      annual_revenue: 1000000, // reais = R$ 1.000.000
      founding_date: "10/10/2010",
      corporation_type: "LTDA",
      phone: "+5511999998888",
      address: addr,
    },
    representative: {
      name: "Tony Stark",
      document: "390.533.447-05",
      email: "tony@estac.com",
      birthdate: "12/10/1985",
      monthly_income: 12000, // reais = R$ 12.000
      professional_occupation: "Sócio",
      mother_name: "Maria",
      self_declared_legal_representative: true,
      phone: "+5511988887777",
      address: addr,
    },
    bank: {
      bank_code: "341",
      branch_number: "1234",
      branch_check_digit: "5",
      account_number: "67890",
      account_check_digit: "1",
      account_type: "checking",
      holder_name: "Estac LTDA",
    },
  };
}

describe("payouts/kyc", () => {
  it("aceita um formulário PJ completo e válido", () => {
    expect(payoutKycSchema.safeParse(validForm()).success).toBe(true);
  });

  it("rejeita CNPJ inválido e representante não confirmado", () => {
    const bad = validForm();
    bad.company.document = "11.222.333/0001-00";
    bad.representative.self_declared_legal_representative = false;
    const res = payoutKycSchema.safeParse(bad);
    expect(res.success).toBe(false);
  });

  it("exige complemento e ponto de referência no endereço (Pagar.me)", () => {
    const noCompl = validForm();
    noCompl.company.address.complement = "";
    expect(payoutKycSchema.safeParse(noCompl).success).toBe(false);

    const noRef = validForm();
    noRef.representative.address.reference_point = "";
    expect(payoutKycSchema.safeParse(noRef).success).toBe(false);
  });

  it("rejeita titular da conta com mais de 30 caracteres", () => {
    const bad = validForm();
    bad.bank.holder_name = "TRACES ESTACIONAMENTOS E PARTICIPACOES LTDA"; // 43 chars
    expect(payoutKycSchema.safeParse(bad).success).toBe(false);
  });

  it("toPayoutAccountPayload mapeia banco plano + kyc_details (dinheiro em reais, telefone em ddd/number)", () => {
    const p = toPayoutAccountPayload(validForm());
    expect(p.document).toBe("11222333000181");
    expect(p.document_type).toBe("cnpj");
    expect(p.holder_document).toBe("11222333000181");
    expect(p.bank_code).toBe("341");
    expect(p.kyc_details.annual_revenue).toBe(1000000); // reais
    expect(p.kyc_details.phone).toEqual({ ddd: "11", number: "999998888" });
    expect(p.kyc_details.address.zip_code).toBe("01310930");
    expect(p.kyc_details.representative.monthly_income).toBe(12000);
    expect(p.kyc_details.representative.document).toBe("39053344705");
  });

  it("emptyPayoutKyc pré-preenche razão social e CNPJ", () => {
    const f = emptyPayoutKyc({ legalName: "X LTDA", document: "11222333000181" });
    expect(f.company.legal_name).toBe("X LTDA");
    expect(f.company.document).toBe("11222333000181");
    expect(f.company.corporation_type).toBe("LTDA");
  });
});
