import { describe, expect, it } from "vitest";
import { formatPhoneBR, pageInfo } from "./users.logic";

describe("formatPhoneBR", () => {
  it("celular e fixo brasileiros ficam legíveis", () => {
    expect(formatPhoneBR("5511999990001")).toBe("(11) 99999-0001");
    expect(formatPhoneBR("551133334444")).toBe("(11) 3333-4444");
  });
  it("número de fora do Brasil sai como +internacional; vazio é nulo", () => {
    expect(formatPhoneBR("351912345678")).toBe("+351912345678");
    expect(formatPhoneBR(null)).toBeNull();
  });
});

describe("pageInfo", () => {
  it("calcula o intervalo e os limites", () => {
    expect(pageInfo(74, 1, 25)).toMatchObject({ pages: 3, from: 1, to: 25, hasPrev: false, hasNext: true });
    expect(pageInfo(74, 3, 25)).toMatchObject({ from: 51, to: 74, hasNext: false });
  });
  it("página fora do intervalo é puxada de volta; lista vazia mostra 0 a 0", () => {
    expect(pageInfo(74, 9, 25).current).toBe(3);
    expect(pageInfo(0, 1, 25)).toMatchObject({ pages: 1, from: 0, to: 0, hasNext: false });
  });
});
