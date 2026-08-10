import { afterEach, describe, expect, it, vi } from "vitest";
import { getAnonSessionId } from "./anonSession";

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("getAnonSessionId", () => {
  it("cria uma vez e devolve o mesmo id nas chamadas seguintes", () => {
    const a = getAnonSessionId();
    const b = getAnonSessionId();
    expect(a).toBeTruthy();
    expect(b).toBe(a);
  });

  it("abas diferentes recebem ids diferentes", () => {
    const a = getAnonSessionId();
    sessionStorage.clear(); // é o que acontece numa aba nova
    const b = getAnonSessionId();
    expect(b).not.toBe(a);
  });

  it("devolve null quando o storage recusa a escrita", () => {
    // Modo privado com cota estourada. Gerar id novo a cada clique inflaria a contagem de
    // sessões distintas do funil, então é melhor não medir.
    vi.spyOn(sessionStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(getAnonSessionId()).toBeNull();
  });

  it("o id não deriva de nada do usuário", () => {
    // Trava de desenho: este valor não pode virar fingerprint. Dois ids gerados em sequência,
    // no mesmo navegador, precisam ser independentes.
    const a = getAnonSessionId();
    sessionStorage.clear();
    const b = getAnonSessionId();
    sessionStorage.clear();
    const c = getAnonSessionId();
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
