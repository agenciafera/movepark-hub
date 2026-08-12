import { describe, expect, it } from "vitest";
import { falasDe } from "./audio.logic";

describe("falasDe", () => {
  /**
   * O post inteiro numa fala só funciona no Safari. O Chrome corta perto dos 15
   * segundos e o leitor perde o resto sem nenhum aviso.
   */
  it("nenhuma fala passa do teto", () => {
    const texto = Array.from({ length: 40 }, (_, i) => `Frase número ${i} do post.`).join(" ");
    for (const fala of falasDe(texto)) {
      expect(fala.length).toBeLessThanOrEqual(180);
    }
  });

  /** Cortar no meio da frase faz a voz baixar o tom como se tivesse terminado. */
  it("corta em fim de frase, e a pontuação vai junto", () => {
    const falas = falasDe(`${"a".repeat(150)}. ${"b".repeat(150)}.`);
    expect(falas).toHaveLength(2);
    expect(falas[0]).toBe(`${"a".repeat(150)}.`);
    expect(falas[1]).toBe(`${"b".repeat(150)}.`);
  });

  it("junta frases curtas até encher a fala", () => {
    expect(falasDe("Um. Dois. Três.")).toEqual(["Um. Dois. Três."]);
  });

  /** O acervo tem frases de mais de 300 caracteres. */
  it("frase maior que o teto cai no corte por palavra, sem partir palavra", () => {
    const palavras = Array.from({ length: 60 }, (_, i) => `palavra${i}`);
    const frase = `${palavras.join(" ")}.`;
    const falas = falasDe(frase);

    expect(falas.length).toBeGreaterThan(1);
    for (const f of falas) expect(f.length).toBeLessThanOrEqual(180);

    // Toda palavra dos pedaços tem que existir inteira no original.
    const inteiras = new Set([...palavras.slice(0, -1), `${palavras.at(-1)}.`]);
    for (const p of falas.flatMap((f) => f.split(" "))) {
      expect(inteiras.has(p)).toBe(true);
    }
    expect(falas.join(" ")).toBe(frase);
  });

  it("texto vazio não vira fala nenhuma", () => {
    expect(falasDe("")).toEqual([]);
    expect(falasDe("   \n  ")).toEqual([]);
  });

  it("normaliza quebra de linha, que o sintetizador lê como pausa dupla", () => {
    expect(falasDe("Uma linha.\n\nOutra linha.")).toEqual(["Uma linha. Outra linha."]);
  });
});
