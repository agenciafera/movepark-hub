import { describe, expect, it } from "vitest";
import { addressPartsFrom, buildBillingAddress, formatCep, normalizeCep, parseViaCep, viaCepUrl } from "./billingAddress.logic";

describe("CEP", () => {
  it("normaliza para 8 dígitos e formata com hífen", () => {
    expect(normalizeCep("80.010-000")).toBe("80010000");
    expect(normalizeCep("8001")).toBeNull();
    expect(formatCep("80010000")).toBe("80010-000");
    expect(formatCep("800")).toBe("800");
    expect(viaCepUrl("80010000")).toBe("https://viacep.com.br/ws/80010000/json/");
  });

  it("lê a resposta do ViaCEP e recusa CEP inexistente", () => {
    expect(parseViaCep({ logradouro: "Rua XV de Novembro", bairro: "Centro", localidade: "Curitiba", uf: "PR" })).toEqual({
      street: "Rua XV de Novembro", neighborhood: "Centro", city: "Curitiba", state: "PR",
    });
    expect(parseViaCep({ erro: true })).toBeNull();
    expect(parseViaCep(null)).toBeNull();
  });
});

describe("buildBillingAddress", () => {
  const parts = { cep: "80010-000", number: "123", complement: "sala 4", street: "Rua XV de Novembro", neighborhood: "Centro", city: "Curitiba", state: "pr" };

  it("monta line_1 como número, rua, bairro e o resto no formato da Pagar.me", () => {
    expect(buildBillingAddress(parts)).toEqual({
      address: { zip_code: "80010000", line_1: "123, Rua XV de Novembro, Centro", line_2: "sala 4", city: "Curitiba", state: "PR", country: "BR" },
    });
  });

  it("CEP sem rua (zona rural) ainda monta; sem número ou sem cidade, explica o que falta", () => {
    expect(buildBillingAddress({ ...parts, street: "", neighborhood: "", complement: "" }).address?.line_1).toBe("123");
    expect(buildBillingAddress({ ...parts, number: " " }).error).toMatch(/número/);
    expect(buildBillingAddress({ ...parts, cep: "1" }).error).toMatch(/CEP/);
    expect(buildBillingAddress({ ...parts, city: "", state: "" }).error).toMatch(/Não achamos/);
  });

  it("prefill do perfil só aceita a forma certa", () => {
    expect(addressPartsFrom({ cep: "80010000", number: "12", city: "Curitiba", state: "PR", street: "R", neighborhood: "C" })?.number).toBe("12");
    expect(addressPartsFrom({ zip_code: "x" })).toBeNull();
    expect(addressPartsFrom(null)).toBeNull();
  });
});
