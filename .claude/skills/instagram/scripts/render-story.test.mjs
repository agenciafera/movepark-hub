import { describe, expect, it } from "vitest";
import { ALTURA, CSS_SEM_ARRASTE, htmlDoStory, LARGURA, nomeDoStory } from "./render-story.mjs";

describe("render-story", () => {
  it("o story do slide x.jpg (ou x.html) é x-story.jpg, o nome que o envio procura", () => {
    expect(nomeDoStory("estacionamento-aeroporto-viracopos-01.jpg")).toBe("estacionamento-aeroporto-viracopos-01-story.jpg");
    expect(nomeDoStory("slide-03.html")).toBe("slide-03-story.jpg");
    expect(nomeDoStory("capa.jpeg")).toBe("capa-story.jpg");
  });

  it("o story é 9:16 em 1080x1920", () => {
    expect(LARGURA / ALTURA).toBeCloseTo(9 / 16, 5);
  });

  it("o HTML põe o slide inteiro no centro, sobre ele mesmo desfocado", () => {
    const html = htmlDoStory("file:///tmp/slide-01.jpg");
    expect(html).toContain("width:1080px;height:1920px");
    expect(html).toContain("blur(");
    expect(html.match(/file:\/\/\/tmp\/slide-01\.jpg/g)).toHaveLength(2);
    expect(html).toContain("translateY(-50%)");
  });

  it("a dica de arrastar do carrossel some no story", () => {
    expect(CSS_SEM_ARRASTE).toBe(".arraste{visibility:hidden !important}");
  });
});
