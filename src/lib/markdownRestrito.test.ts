import { describe, expect, it } from "vitest";
import {
  hrefSeguro,
  parseInlineRestrito,
  parseMarkdownRestrito,
  temAviso,
  textoDoInline,
} from "./markdownRestrito";

/**
 * Amostras compartilhadas com `supabase/functions/_shared/markdown-restrito.test.ts`: o front
 * e as Edges têm que ler o mesmo aviso do mesmo jeito.
 */
describe("parseMarkdownRestrito", () => {
  it("vazio e só espaço não produzem bloco (o aviso não existe)", () => {
    expect(parseMarkdownRestrito(null)).toEqual([]);
    expect(parseMarkdownRestrito("")).toEqual([]);
    expect(parseMarkdownRestrito("  \n\n  ")).toEqual([]);
    expect(temAviso("  \n")).toBe(false);
    expect(temAviso("Aviso")).toBe(true);
  });

  it("cada linha é um parágrafo; linhas com - viram uma lista só", () => {
    const blocos = parseMarkdownRestrito(
      "**Malas extras** são cobradas.\nA van leva até 2 malas.\n- Até 2 malas por pessoa\n- Acima disso, taxa por mala\n\nPagamento na chegada.",
    );
    expect(blocos.map((b) => b.type)).toEqual(["paragraph", "paragraph", "list", "paragraph"]);
    const lista = blocos[2];
    if (lista.type !== "list") throw new Error("esperava lista");
    expect(lista.ordered).toBe(false);
    expect(lista.items.map(textoDoInline)).toEqual([
      "Até 2 malas por pessoa",
      "Acima disso, taxa por mala",
    ]);
  });

  it("lista numerada é ordenada; trocar o marcador abre outra lista", () => {
    const blocos = parseMarkdownRestrito("1. Chegue\n2. Pague\n- Pronto");
    expect(blocos).toHaveLength(2);
    expect(blocos[0]).toMatchObject({ type: "list", ordered: true });
    expect(blocos[1]).toMatchObject({ type: "list", ordered: false });
  });

  it("título, citação e HTML cru saem como texto comum", () => {
    const blocos = parseMarkdownRestrito("# Atenção\n> frase\n<b>cru</b>");
    expect(blocos.every((b) => b.type === "paragraph")).toBe(true);
    expect(blocos.map((b) => (b.type === "paragraph" ? textoDoInline(b.content) : ""))).toEqual([
      "# Atenção",
      "> frase",
      "<b>cru</b>",
    ]);
  });
});

describe("parseInlineRestrito", () => {
  it("negrito, itálico (dos dois jeitos) e link https", () => {
    expect(parseInlineRestrito("**forte** _leve_ *leve2* [regras](https://ex.com/r)")).toEqual([
      { type: "bold", children: [{ type: "text", value: "forte" }] },
      { type: "text", value: " " },
      { type: "italic", children: [{ type: "text", value: "leve" }] },
      { type: "text", value: " " },
      { type: "italic", children: [{ type: "text", value: "leve2" }] },
      { type: "text", value: " " },
      { type: "link", href: "https://ex.com/r", children: [{ type: "text", value: "regras" }] },
    ]);
  });

  it("link que não é http(s) vira só o rótulo, sem destino", () => {
    expect(parseInlineRestrito("[clique](javascript:void0)")).toEqual([
      { type: "text", value: "clique" },
    ]);
    expect(hrefSeguro("data:text/html,x")).toBeNull();
    expect(hrefSeguro("http://movepark.co")).toBe("http://movepark.co");
  });

  it("barra invertida escapa o marcador; sublinhado dentro de palavra não é itálico", () => {
    expect(textoDoInline(parseInlineRestrito("\\*não é lista\\* snake_case_aqui"))).toBe(
      "*não é lista* snake_case_aqui",
    );
    expect(parseInlineRestrito("snake_case_aqui")).toEqual([
      { type: "text", value: "snake_case_aqui" },
    ]);
  });
});
