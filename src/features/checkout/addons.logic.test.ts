import { describe, expect, it } from "vitest";
import { carroDoTitulo } from "./addons.logic";

describe("carroDoTitulo", () => {
  it("usa o modelo quando o veículo tem um", () => {
    expect(carroDoTitulo("Ford Fiesta")).toBe("Ford Fiesta");
  });

  it("cai pra 'seu carro' sem modelo", () => {
    expect(carroDoTitulo(null)).toBe("seu carro");
    expect(carroDoTitulo(undefined)).toBe("seu carro");
  });

  // Modelo em branco vem de cadastro manual, onde o campo é opcional.
  it("trata modelo em branco como ausente", () => {
    expect(carroDoTitulo("   ")).toBe("seu carro");
  });
});
