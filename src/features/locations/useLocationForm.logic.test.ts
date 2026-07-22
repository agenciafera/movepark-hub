import { describe, expect, it } from "vitest";
import { parsePositiveInt, isValidMinutes } from "./useLocationForm";

describe("parsePositiveInt", () => {
  it("aceita inteiro positivo, recusa zero/negativo/lixo", () => {
    expect(parsePositiveInt("15")).toBe(15);
    expect(parsePositiveInt("0")).toBeNull();
    expect(parsePositiveInt("-5")).toBeNull();
    expect(parsePositiveInt("abc")).toBeNull();
    expect(parsePositiveInt("")).toBeNull();
  });
});

describe("isValidMinutes", () => {
  it("vazio é válido (sem transfer)", () => {
    expect(isValidMinutes("")).toBe(true);
    expect(isValidMinutes("   ")).toBe(true);
  });
  it("inteiro positivo é válido", () => {
    expect(isValidMinutes("15")).toBe(true);
  });
  it("zero e negativo são inválidos (o que antes virava null silencioso)", () => {
    expect(isValidMinutes("0")).toBe(false);
    expect(isValidMinutes("-3")).toBe(false);
  });
});
