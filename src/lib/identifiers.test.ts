import { describe, it, expect } from "vitest";
import { normalizeEmail, normalizePhoneE164 } from "./identifiers";

describe("normalizeEmail", () => {
  it("trim + lowercase", () => {
    expect(normalizeEmail("  Ana@Empresa.COM ")).toBe("ana@empresa.com");
  });
  it("rejeita inválido / vazio", () => {
    expect(normalizeEmail("semarroba")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe("normalizePhoneE164", () => {
  it("já em E.164 → mantém", () => {
    expect(normalizePhoneE164("+5511999990001")).toBe("+5511999990001");
  });
  it("número BR local → resolve com defaultCountry", () => {
    // (11) 99999-0001 sem DDI, país padrão BR
    expect(normalizePhoneE164("11999990001")).toBe("+5511999990001");
  });
  it("inválido / vazio → null", () => {
    expect(normalizePhoneE164("123")).toBeNull();
    expect(normalizePhoneE164("")).toBeNull();
    expect(normalizePhoneE164(null)).toBeNull();
    expect(normalizePhoneE164("abc")).toBeNull();
  });
});
