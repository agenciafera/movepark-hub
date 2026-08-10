import { describe, expect, it } from "vitest";
import {
  metaDescription,
  parseInline,
  parseMarkdown,
  plainText,
  readingMinutes,
} from "./markdown.logic";

describe("parseInline", () => {
  it("separa negrito, itálico e texto", () => {
    expect(parseInline("fique **atento** ao _prazo_")).toEqual([
      { type: "text", value: "fique " },
      { type: "bold", value: "atento" },
      { type: "text", value: " ao " },
      { type: "italic", value: "prazo" },
    ]);
  });

  it("extrai link com rótulo e destino", () => {
    expect(parseInline("veja o [destino](/destinos/aeroporto-de-viracopos) agora")).toEqual([
      { type: "text", value: "veja o " },
      { type: "link", href: "/destinos/aeroporto-de-viracopos", label: "destino" },
      { type: "text", value: " agora" },
    ]);
  });

  it("não confunde imagem inline com link", () => {
    expect(parseInline("![foto do lote](/images/blog/x/y.webp)")).toEqual([
      { type: "text", value: "foto do lote" },
    ]);
  });

  it("preserva sublinhado dentro de palavra (não vira itálico)", () => {
    expect(parseInline("o campo legacy_wp_id é a chave")).toEqual([
      { type: "text", value: "o campo legacy_wp_id é a chave" },
    ]);
  });
});

describe("parseMarkdown", () => {
  it("rebaixa h1 do corpo para h2, porque o h1 da página é o título", () => {
    const [block] = parseMarkdown("# Título dentro do corpo");
    expect(block).toEqual({
      type: "heading",
      level: 2,
      content: [{ type: "text", value: "Título dentro do corpo" }],
    });
  });

  it("mantém h2 e h3 e trava h4+ em 4", () => {
    const levels = parseMarkdown("## dois\n\n### três\n\n##### cinco").map(
      (b) => b.type === "heading" && b.level,
    );
    expect(levels).toEqual([2, 3, 4]);
  });

  it("agrupa linhas seguidas num parágrafo só", () => {
    const blocks = parseMarkdown("primeira linha\nsegunda linha\n\noutro parágrafo");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "paragraph" });
    expect(plainText("primeira linha\nsegunda linha")).toBe("primeira linha segunda linha");
  });

  it("separa lista não ordenada de ordenada", () => {
    const blocks = parseMarkdown("- um\n- dois\n\n1. primeiro\n2. segundo");
    expect(blocks).toEqual([
      {
        type: "list",
        ordered: false,
        items: [[{ type: "text", value: "um" }], [{ type: "text", value: "dois" }]],
      },
      {
        type: "list",
        ordered: true,
        items: [[{ type: "text", value: "primeiro" }], [{ type: "text", value: "segundo" }]],
      },
    ]);
  });

  it("trata imagem sozinha na linha como bloco próprio", () => {
    expect(parseMarkdown("![vaga coberta](/images/blog/post/vaga.webp)")).toEqual([
      { type: "image", src: "/images/blog/post/vaga.webp", alt: "vaga coberta" },
    ]);
  });

  it("junta linhas de citação num bloco só", () => {
    expect(parseMarkdown("> primeira\n> segunda")).toEqual([
      { type: "quote", content: [{ type: "text", value: "primeira segunda" }] },
    ]);
  });

  it("fecha o bloco anterior ao trocar de tipo sem linha em branco", () => {
    const blocks = parseMarkdown("texto solto\n- item da lista\n## título");
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "list", "heading"]);
  });

  it("devolve lista vazia para corpo vazio", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("   \n\n  ")).toEqual([]);
  });
});

describe("plainText e readingMinutes", () => {
  it("ignora imagem e resolve link pelo rótulo", () => {
    const md = "![alt](/a.webp)\n\nleia o [guia completo](/blog/x/) antes";
    expect(plainText(md)).toBe("leia o guia completo antes");
  });

  it("arredonda o tempo de leitura para cima, com mínimo de 1", () => {
    expect(readingMinutes("uma palavra só")).toBe(1);
    expect(readingMinutes(Array.from({ length: 401 }, () => "palavra").join(" "))).toBe(3);
  });
});

describe("metaDescription", () => {
  it("usa a description escrita no Yoast quando existe", () => {
    expect(metaDescription("Escrita no CMS", "resumo automático", "corpo")).toBe("Escrita no CMS");
  });

  it("descarta o [...] que o resumo automático do WordPress deixa no fim", () => {
    expect(metaDescription(null, "Guia dos estacionamentos de Viracopos. [...]", "corpo")).toBe(
      "Guia dos estacionamentos de Viracopos.",
    );
  });

  it("corta na última frase que couber, em vez de no meio da palavra", () => {
    const texto = `${"a".repeat(80)}. ${"b".repeat(200)}`;
    const out = metaDescription(null, texto, "corpo", 155);
    expect(out).toBe(`${"a".repeat(80)}.`);
  });

  it("sem frase utilizável, corta na palavra e sinaliza a continuação", () => {
    const out = metaDescription(null, Array.from({ length: 60 }, () => "palavra").join(" "), "c", 50);
    expect(out.length).toBeLessThanOrEqual(53);
    expect(out.endsWith("...")).toBe(true);
    expect(out).not.toContain("palav.");
  });

  it("cai no corpo quando não há resumo nenhum", () => {
    expect(metaDescription(null, null, "## Título\n\nO corpo do post.")).toBe(
      "Título O corpo do post.",
    );
  });
});
