import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MEASUREMENT_OPTOUT_KEY,
  isMeasurementOptedOut,
  setMeasurementOptOut,
} from "./measurement-optout";

const storageOriginal = Object.getOwnPropertyDescriptor(window, "localStorage");

/** Faz o acesso a `window.localStorage` lançar, como em navegação privada com bloqueio. */
function bloquearStorage() {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new Error("SecurityError");
    },
  });
}

afterEach(() => {
  if (storageOriginal) Object.defineProperty(window, "localStorage", storageOriginal);
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("opt-out de medição", () => {
  it("sem a chave, mede", () => {
    expect(isMeasurementOptedOut()).toBe(false);
  });

  it("grava '1' na chave e passa a responder que não mede", () => {
    expect(setMeasurementOptOut(true)).toBe(true);
    expect(localStorage.getItem(MEASUREMENT_OPTOUT_KEY)).toBe("1");
    expect(isMeasurementOptedOut()).toBe(true);
  });

  it("reverter remove a chave", () => {
    setMeasurementOptOut(true);
    expect(setMeasurementOptOut(false)).toBe(true);
    expect(localStorage.getItem(MEASUREMENT_OPTOUT_KEY)).toBeNull();
    expect(isMeasurementOptedOut()).toBe(false);
  });

  it("só o valor '1' conta como opt-out", () => {
    localStorage.setItem(MEASUREMENT_OPTOUT_KEY, "true");
    expect(isMeasurementOptedOut()).toBe(false);
  });

  /**
   * Navegação privada e política de navegador podem lançar no acesso ao `localStorage`.
   * A leitura responde "mede" e a escrita avisa que não gravou; nada sobe para a tela
   * como exceção.
   */
  it("com localStorage lançando, lê como 'mede' e avisa que não gravou", () => {
    bloquearStorage();

    expect(isMeasurementOptedOut()).toBe(false);
    expect(setMeasurementOptOut(true)).toBe(false);
  });
});
