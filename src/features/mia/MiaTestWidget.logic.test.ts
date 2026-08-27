import { describe, expect, it } from "vitest";
import {
  identidadeDe,
  normalizarTelefone,
  rotuloDoTelefone,
  telefoneAceito,
  TELEFONE_PADRAO,
} from "./MiaTestWidget.logic";

describe("telefone da bancada de teste", () => {
  it("aceita o formato que a pessoa realmente digita", () => {
    // Ninguém escreve o DDI de cabeça. Exigir vira formulário chato, e o erro apareceria
    // lá na frente como "reserva não encontrada", que é a pior forma de dizer "faltou o 55".
    expect(normalizarTelefone("(41) 98814-9449")).toBe("5541988149449");
    expect(normalizarTelefone("41988149449")).toBe("5541988149449");
    expect(normalizarTelefone("4133334444")).toBe("554133334444");
  });

  it("não duplica o DDI de quem já digitou completo", () => {
    expect(normalizarTelefone("5541988149449")).toBe("5541988149449");
    expect(normalizarTelefone("+55 41 98814-9449")).toBe("5541988149449");
  });

  it("vazio é válido, porque cai no número de ninguém", () => {
    expect(telefoneAceito("")).toBe(true);
    expect(telefoneAceito("   ")).toBe(true);
    expect(identidadeDe("", "webchat-bot").telefone).toBe(TELEFONE_PADRAO);
  });

  it("recusa número curto antes de a Edge recusar", () => {
    // As duas regras precisam concordar: campo que aceita e servidor que recusa é a
    // combinação que mais irrita.
    expect(telefoneAceito("4198814")).toBe(false);
    expect(telefoneAceito("988149449")).toBe(false);
  });

  it("monta a identidade com a origem escolhida", () => {
    expect(identidadeDe("(41) 98814-9449", "whatsapp-bot")).toEqual({
      telefone: "5541988149449",
      origem: "whatsapp-bot",
    });
  });
});

describe("o rótulo do cabeçalho", () => {
  it("não finge que o número padrão é alguém", () => {
    expect(rotuloDoTelefone(TELEFONE_PADRAO)).toBe("sem cliente");
  });

  it("mostra o número de um jeito legível", () => {
    expect(rotuloDoTelefone("5541988149449")).toBe("(41) 98814-9449");
    expect(rotuloDoTelefone("554133334444")).toBe("(41) 3333-4444");
  });
});
