import { describe, it, expect } from "vitest";
import { normalizeEmail, normalizePhoneE164, storedPhoneToE164 } from "./identifiers";

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

describe("storedPhoneToE164 (recuperação: Supabase guarda sem '+')", () => {
  it("número do Supabase sem '+' → prefixa o '+' (bandeira volta a ser reconhecida)", () => {
    // caso real do bug: auth.users.phone = "5511987727182"
    expect(storedPhoneToE164("5511987727182")).toBe("+5511987727182");
  });
  it("já com '+' → mantém intacto", () => {
    expect(storedPhoneToE164("+5511987727182")).toBe("+5511987727182");
  });
  it("limpa formatação e prefixa", () => {
    expect(storedPhoneToE164(" 55 11 98772-7182 ")).toBe("+5511987727182");
  });
  it("vazio / nulo → null", () => {
    expect(storedPhoneToE164("")).toBeNull();
    expect(storedPhoneToE164(null)).toBeNull();
    expect(storedPhoneToE164(undefined)).toBeNull();
  });
});
