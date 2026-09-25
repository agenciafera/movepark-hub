import { describe, expect, it } from "vitest";

import { nomeDaVaga } from "./i18nVaga";

describe("nomeDaVaga", () => {
  it("em português devolve o nome do banco, sem passar pelo mapa", () => {
    expect(nomeDaVaga("pt-BR", "covered", "Vaga Coberta")).toBe("Vaga Coberta");
    // Mesmo um código fora do mapa: o português é a fonte.
    expect(nomeDaVaga("pt-BR", "novo_tipo", "Vaga Nova")).toBe("Vaga Nova");
  });

  it("traduz os tipos conhecidos", () => {
    expect(nomeDaVaga("en", "covered", "Vaga Coberta")).toBe("Covered spot");
    expect(nomeDaVaga("en", "uncovered", "Vaga Descoberta")).toBe("Uncovered spot");
    expect(nomeDaVaga("es", "covered", "Vaga Coberta")).toBe("Plaza cubierta");
    expect(nomeDaVaga("es", "motorcycle", "Vaga de Moto")).toBe("Plaza de moto");
  });

  it("a chave é o código, não o nome", () => {
    // Nome é texto de exibição e pode ser reescrito no admin; se o mapa casasse por
    // nome, pararia de funcionar em silêncio na primeira edição.
    expect(nomeDaVaga("en", "covered", "Coberta com sombrite")).toBe("Covered spot");
  });

  it("tipo desconhecido cai no nome do banco em vez de sumir", () => {
    expect(nomeDaVaga("en", "tipo_novo", "Vaga Nova")).toBe("Vaga Nova");
    expect(nomeDaVaga("en", null, "Vaga Nova")).toBe("Vaga Nova");
  });
});
