import { describe, expect, it } from "vitest";
import { BRAZILIAN_STATES, BRAZILIAN_UFS, normalizeUf } from "./brazilian-states";

describe("brazilian-states", () => {
  it("tem as 27 unidades federativas, sem duplicatas", () => {
    expect(BRAZILIAN_STATES).toHaveLength(27);
    expect(new Set(BRAZILIAN_UFS).size).toBe(27);
  });

  it("toda UF é um código de 2 letras maiúsculas", () => {
    for (const { uf } of BRAZILIAN_STATES) {
      expect(uf).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("todo estado tem nome não vazio", () => {
    for (const { name } of BRAZILIAN_STATES) {
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });

  it("está ordenado alfabeticamente por nome (pt-BR)", () => {
    const names = BRAZILIAN_STATES.map((s) => s.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b, "pt-BR"));
    expect(names).toEqual(sorted);
  });

  it("inclui UFs conhecidas", () => {
    expect(BRAZILIAN_UFS).toContain("SP");
    expect(BRAZILIAN_UFS).toContain("DF");
    expect(BRAZILIAN_UFS).toContain("RJ");
  });

  describe("normalizeUf", () => {
    it("normaliza minúsculas e espaços para a UF canônica", () => {
      expect(normalizeUf(" sp ")).toBe("SP");
      expect(normalizeUf("rj")).toBe("RJ");
    });

    it("retorna null para entradas inválidas ou vazias", () => {
      expect(normalizeUf("")).toBeNull();
      expect(normalizeUf(null)).toBeNull();
      expect(normalizeUf(undefined)).toBeNull();
      expect(normalizeUf("XX")).toBeNull();
      expect(normalizeUf("São Paulo")).toBeNull();
    });
  });
});
