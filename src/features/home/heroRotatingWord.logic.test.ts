import { describe, expect, it } from "vitest";
import { proximaPalavraIndex, ROTATING_HERO_WORDS } from "./heroRotatingWord.logic";

describe("ROTATING_HERO_WORDS", () => {
  it("começa em 'aeroporto', que é a maioria das unidades hoje e o valor de SEO/LCP", () => {
    expect(ROTATING_HERO_WORDS[0]).toBe("aeroporto");
  });
});

describe("proximaPalavraIndex", () => {
  it("avança um índice por vez", () => {
    expect(proximaPalavraIndex(0, 3)).toBe(1);
    expect(proximaPalavraIndex(1, 3)).toBe(2);
  });

  it("volta pro início depois da última palavra", () => {
    expect(proximaPalavraIndex(2, 3)).toBe(0);
  });

  it("não trava com lista vazia", () => {
    expect(proximaPalavraIndex(0, 0)).toBe(0);
  });
});
