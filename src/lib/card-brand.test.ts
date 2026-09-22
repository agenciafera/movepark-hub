import { describe, expect, it } from "vitest";
import { brandLabel, detectBrand, normalizeBrand } from "./card-brand";
import { cardNumberMask } from "./masks";

describe("detectBrand", () => {
  it("as cinco bandeiras que a Movepark aceita, com e sem máscara", () => {
    expect(detectBrand("4111 1111 1111 1111")).toBe("visa");
    expect(detectBrand("5555555555554444")).toBe("mastercard");
    expect(detectBrand("2223000048400011")).toBe("mastercard");
    expect(detectBrand("378282246310005")).toBe("amex");
    expect(detectBrand("6362970000457013")).toBe("elo");
    expect(detectBrand("6062825624254001")).toBe("hipercard");
  });
  it("Elo e Hipercard vencem Visa e Mastercard nos BINs que começam com 4, 5 e 6", () => {
    expect(detectBrand("4011780000000000")).toBe("elo");
    expect(detectBrand("5067200000000000")).toBe("elo");
    expect(detectBrand("6011000000000000")).toBe("card"); // Discover: não é Elo só por começar com 6
  });
  it("antes de 4 dígitos ainda não dá para dizer", () => {
    expect(detectBrand("411")).toBe("card");
    expect(detectBrand("")).toBe("card");
  });
});

describe("normalizeBrand e brandLabel", () => {
  it("o que a Pagar.me manda e o que o front grava viram a mesma coisa", () => {
    expect(normalizeBrand("Visa")).toBe("visa");
    expect(normalizeBrand("American Express")).toBe("amex");
    expect(normalizeBrand("HiperCard")).toBe("hipercard");
    expect(normalizeBrand("unknown")).toBe("card");
    expect(normalizeBrand(null)).toBe("card");
  });
  it("o rótulo da tela sai do vocabulário único", () => {
    expect(brandLabel("Visa")).toBe("Visa");
    expect(brandLabel("amex")).toBe("American Express");
    expect(brandLabel("whatever")).toBe("Cartão");
  });
});

describe("cardNumberMask", () => {
  it("grupos de 4, e 4-6-5 no Amex", () => {
    expect(cardNumberMask("4111111111111111")).toBe("4111 1111 1111 1111");
    expect(cardNumberMask("4111 11")).toBe("4111 11");
    expect(cardNumberMask("378282246310005")).toBe("3782 822463 10005");
    expect(cardNumberMask("abc4111")).toBe("4111");
  });
});
