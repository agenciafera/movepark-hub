import { describe, expect, it } from "vitest";
import {
  isValidCep,
  isValidCnpj,
  isValidCpf,
  isValidPastDateBR,
  isValidPhoneBR,
} from "./documents";

describe("documents", () => {
  it("isValidCpf aceita válido e rejeita inválido/repetido", () => {
    expect(isValidCpf("390.533.447-05")).toBe(true);
    expect(isValidCpf("39053344705")).toBe(true);
    expect(isValidCpf("390.533.447-00")).toBe(false); // dígito errado
    expect(isValidCpf("111.111.111-11")).toBe(false); // repetido
    expect(isValidCpf("123")).toBe(false);
  });

  it("isValidCnpj aceita válido e rejeita inválido/repetido", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-00")).toBe(false); // dígito errado
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false); // repetido
  });

  it("isValidCep exige 8 dígitos", () => {
    expect(isValidCep("01310-930")).toBe(true);
    expect(isValidCep("0131093")).toBe(false);
  });

  it("isValidPhoneBR aceita 10 ou 11 dígitos", () => {
    expect(isValidPhoneBR("(11) 3333-4444")).toBe(true);
    expect(isValidPhoneBR("(11) 99999-8888")).toBe(true);
    expect(isValidPhoneBR("1199")).toBe(false);
  });

  it("isValidPastDateBR aceita data válida no passado", () => {
    expect(isValidPastDateBR("12/10/1995")).toBe(true);
    expect(isValidPastDateBR("31/02/1995")).toBe(false); // dia inválido
    expect(isValidPastDateBR("01/01/2999")).toBe(false); // futuro
    expect(isValidPastDateBR("12/10")).toBe(false);
  });
});
