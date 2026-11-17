import { describe, expect, it } from "vitest";
import { ehFichaDeEstacionamento } from "./cascaDaFicha.logic";

describe("ehFichaDeEstacionamento", () => {
  it.each([
    "/estacionamentos/aeroporto-guarulhos/pare-seguro",
    "/estacionamentos/aeroporto-guarulhos/pare-seguro/",
  ])("reconhece a ficha em %s", (caminho) => {
    expect(ehFichaDeEstacionamento(caminho)).toBe(true);
  });

  it.each([
    "/",
    "/search",
    "/estacionamentos",
    "/estacionamentos/aeroporto-guarulhos",
    "/estacionamentos/aeroporto-guarulhos/precos",
    "/estacionamentos/aeroporto-guarulhos/mais-barato",
    "/en/airport-parking/aeroporto-guarulhos",
    "/checkout/ABC123",
  ])("não trata %s como ficha", (caminho) => {
    expect(ehFichaDeEstacionamento(caminho)).toBe(false);
  });
});
