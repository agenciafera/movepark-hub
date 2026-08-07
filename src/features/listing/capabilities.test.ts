import { describe, expect, it } from "vitest";
import { getLocationCapabilities, isExternalCheckout, type LocationCapabilities } from "./capabilities";

describe("getLocationCapabilities", () => {
  it("unidade própria entrega tudo", () => {
    const caps = getLocationCapabilities({ checkout_mode: "hub" });
    expect(Object.values(caps).every(Boolean)).toBe(true);
  });

  it("unidade externa derruba o conjunto de uma vez", () => {
    const caps = getLocationCapabilities({ checkout_mode: "external" });
    expect(Object.values(caps).some(Boolean)).toBe(false);
  });

  it("valor ausente cai em própria, não em externa", () => {
    // O default permissivo é deliberado: `checkout_mode` nasceu com default 'hub' e quase toda
    // unidade é nativa. Ler ausência como "sem capacidade" apagaria a página inteira delas no
    // primeiro select que esquecesse a coluna.
    for (const entrada of [null, undefined, {}, { checkout_mode: null }]) {
      expect(getLocationCapabilities(entrada as never).hubCheckout).toBe(true);
    }
  });

  it("devolve objeto novo a cada chamada, para ninguém mutar o preset", () => {
    const a = getLocationCapabilities({ checkout_mode: "hub" });
    a.coupons = false;
    expect(getLocationCapabilities({ checkout_mode: "hub" }).coupons).toBe(true);
  });

  it("isExternalCheckout espelha hubCheckout", () => {
    expect(isExternalCheckout({ checkout_mode: "external" })).toBe(true);
    expect(isExternalCheckout({ checkout_mode: "hub" })).toBe(false);
  });
});

describe("lista canônica de promessas", () => {
  it("cobre todos os blocos mapeados no ADR-009", () => {
    // Se um bloco de promessa novo entrar na single sem capacidade, ele não tem onde ler, e
    // este teste é o lembrete de que a lista é o contrato. Mexer aqui é decisão, não ajuste.
    const esperadas: (keyof LocationCapabilities)[] = [
      "fares",
      "cancellation",
      "dateChange",
      "coupons",
      "addOns",
      "reviews",
      "guaranteedSpot",
      "globalFaq",
      "hubCheckout",
    ];
    expect(Object.keys(getLocationCapabilities({ checkout_mode: "hub" })).sort()).toEqual(
      [...esperadas].sort(),
    );
  });
});
