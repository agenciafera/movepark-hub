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
      { type: "bold", children: [{ type: "text", value: "atento" }] },
      { type: "text", value: " ao " },
      { type: "italic", children: [{ type: "text", value: "prazo" }] },
    ]);
  });

  it("extrai link com rótulo e destino", () => {
    expect(parseInline("veja o [destino](/destinos/aeroporto-de-viracopos) agora")).toEqual([
      { type: "text", value: "veja o " },
      {
        type: "link",
        href: "/destinos/aeroporto-de-viracopos",
        children: [{ type: "text", value: "destino" }],
      },
      { type: "text", value: " agora" },
    ]);
  });

  it("parseia o markdown de dentro do rótulo do link", () => {
    // O WordPress gerou `[**Nome**](url)` em 28 links de 17 posts. Sem parsear o
    // rótulo, os asteriscos iam para a tela.
    expect(parseInline("O [**Nation Park**](http://nationpark.com.br) destaca-se")).toEqual([
      { type: "text", value: "O " },
      {
        type: "link",
        href: "http://nationpark.com.br",
        children: [{ type: "bold", children: [{ type: "text", value: "Nation Park" }] }],
      },
      { type: "text", value: " destaca-se" },
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
        items: [
          { content: [{ type: "text", value: "um" }] },
          { content: [{ type: "text", value: "dois" }] },
        ],
      },
      {
        type: "list",
        ordered: true,
        items: [
          { content: [{ type: "text", value: "primeiro" }] },
          { content: [{ type: "text", value: "segundo" }] },
        ],
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

describe("lista vinda do WordPress", () => {
  it("item que começa com título não deixa o ### na tela", () => {
    // O editor clássico gerou "1.  ### **Reserve Voos:**" em 12 itens de 3 posts.
    const [bloco] = parseMarkdown("1.  ### **Reserve Voos:**");
    expect(bloco).toEqual({
      type: "list",
      ordered: true,
      items: [{ content: [{ type: "bold", children: [{ type: "text", value: "Reserve Voos:" }] }] }],
    });
  });

  it("linha indentada continua o item em vez de abrir parágrafo", () => {
    const blocks = parseMarkdown("1.  Reserve antes\n    Garante o preço menor.");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "list", ordered: true });
    expect(plainText("1.  Reserve antes\n    Garante o preço menor.")).toBe(
      "Reserve antes Garante o preço menor.",
    );
  });

  it("linha em branco entre itens não reinicia a numeração", () => {
    // Era o que picotava a lista em 5 posts: o item 2 abria uma lista nova.
    const blocks = parseMarkdown("1.  Primeiro\n    \n    Detalhe do primeiro\n    \n2.  Segundo");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "list", ordered: true });
    expect((blocks[0] as { items: unknown[] }).items).toHaveLength(2);
  });

  it("sublista indentada vira filha do item, não irmã", () => {
    const [bloco] = parseMarkdown("- Coberto\n  - Protegido do sol\n  - Protegido da chuva\n- Valet");
    expect(bloco).toEqual({
      type: "list",
      ordered: false,
      items: [
        {
          content: [{ type: "text", value: "Coberto" }],
          sub: {
            ordered: false,
            items: [
              [{ type: "text", value: "Protegido do sol" }],
              [{ type: "text", value: "Protegido da chuva" }],
            ],
          },
        },
        { content: [{ type: "text", value: "Valet" }] },
      ],
    });
  });

  it("linha em branco fora de lista continua separando parágrafos", () => {
    expect(parseMarkdown("um\n\ndois").map((b) => b.type)).toEqual(["paragraph", "paragraph"]);
  });
});

describe("marcação aninhada nos dois sentidos", () => {
  it("link dentro de negrito sai como link, não como texto cru", () => {
    // `**[Nome](url)**` aparecia literal em 20 blocos: o negrito guardava o miolo
    // como string, então o link nunca era parseado.
    expect(parseInline("**[AeroParking](https://aeroparking.com.br/)**")).toEqual([
      {
        type: "bold",
        children: [
          {
            type: "link",
            href: "https://aeroparking.com.br/",
            children: [{ type: "text", value: "AeroParking" }],
          },
        ],
      },
    ]);
  });

  it("negrito dentro de link continua saindo em negrito", () => {
    expect(parseInline("[**Nation Park**](http://nationpark.com.br)")).toEqual([
      {
        type: "link",
        href: "http://nationpark.com.br",
        children: [{ type: "bold", children: [{ type: "text", value: "Nation Park" }] }],
      },
    ]);
  });

  it("itálico dentro de link também", () => {
    expect(parseInline("[_Dica_](/blog/x/)")).toEqual([
      {
        type: "link",
        href: "/blog/x/",
        children: [{ type: "italic", children: [{ type: "text", value: "Dica" }] }],
      },
    ]);
  });

  it("o texto puro atravessa qualquer aninhamento", () => {
    expect(plainText("**[AeroParking](https://x.com)** é a opção")).toBe("AeroParking é a opção");
  });
});

describe("hierarquia de títulos", () => {
  it("post que abre em h3 sobe a hierarquia, mantendo a estrutura relativa", () => {
    // O h1 é o título da página; abrir em h3 pula um nível no outline.
    const niveis = parseMarkdown("### Seção\n\n#### Detalhe\n\n### Outra seção")
      .filter((b) => b.type === "heading")
      .map((b) => (b as { level: number }).level);
    expect(niveis).toEqual([2, 3, 2]);
  });

  it("post que já tem h2 não é mexido", () => {
    const niveis = parseMarkdown("## Seção\n\n### Detalhe")
      .filter((b) => b.type === "heading")
      .map((b) => (b as { level: number }).level);
    expect(niveis).toEqual([2, 3]);
  });

  it("post sem título nenhum não quebra", () => {
    expect(parseMarkdown("só um parágrafo").map((b) => b.type)).toEqual(["paragraph"]);
  });
});

describe("separador temático", () => {
  it("`* * *` vira separador, não item de lista", () => {
    // Eram 105 no acervo, em 14 posts, cada um virando um bullet com o texto "* *".
    expect(parseMarkdown("um\n\n* * *\n\ndois").map((b) => b.type)).toEqual([
      "paragraph",
      "rule",
      "paragraph",
    ]);
  });

  it("aceita as outras formas usuais", () => {
    for (const forma of ["---", "***", "___", "- - -", "_ _ _"]) {
      expect(parseMarkdown(forma).map((b) => b.type), forma).toEqual(["rule"]);
    }
  });

  it("não confunde com item de lista de verdade", () => {
    expect(parseMarkdown("* item").map((b) => b.type)).toEqual(["list"]);
    expect(parseMarkdown("- item").map((b) => b.type)).toEqual(["list"]);
  });

  it("o separador não entra no texto puro nem no tempo de leitura", () => {
    expect(plainText("um\n\n* * *\n\ndois")).toBe("um dois");
  });
});

describe("tabela", () => {
  const tabela = "| Lote | Diária |\n| --- | --- |\n| Virapark | R$ 29 |\n| GarageInn | R$ 34 |";

  it("separa cabeçalho do corpo e não deixa a linha de traços virar conteúdo", () => {
    const [bloco] = parseMarkdown(tabela) as { type: string; head: unknown[]; rows: unknown[][] }[];
    expect(bloco.type).toBe("table");
    expect(bloco.head).toHaveLength(2);
    expect(bloco.rows).toHaveLength(2);
    expect(bloco.rows[0]).toHaveLength(2);
  });

  it("a célula aceita marcação", () => {
    const [bloco] = parseMarkdown("| a | b |\n| --- | --- |\n| **forte** | [link](/x) |") as {
      rows: { type: string }[][][];
    }[];
    expect(bloco.rows[0][0][0].type).toBe("bold");
    expect(bloco.rows[0][1][0].type).toBe("link");
  });

  it("tabela sem linha separadora não perde a primeira linha", () => {
    const [bloco] = parseMarkdown("| a | b |") as { head: unknown[]; rows: unknown[][] }[];
    expect(bloco.head).toHaveLength(0);
    expect(bloco.rows).toHaveLength(1);
  });

  it("o texto da tabela entra no texto puro", () => {
    expect(plainText(tabela)).toContain("Virapark");
    expect(plainText(tabela)).toContain("R$ 34");
  });
});

describe("parágrafo que é só negrito", () => {
  it("vira subtítulo, porque o editor usava negrito no lugar de título", () => {
    // Com um h2 real no post, o subtítulo derivado fica no degrau de baixo.
    const blocos = parseMarkdown("## Seção\n\n**Nation Park**\n\ntexto") as {
      type: string;
      level: number;
    }[];
    expect(blocos[1].type).toBe("heading");
    expect(blocos[1].level).toBe(4);
  });

  it("frase inteira em negrito continua parágrafo", () => {
    // Ponto final e tamanho separam o subtítulo de uma frase enfatizada.
    const [bloco] = parseMarkdown("**Reserve com antecedência para garantir a vaga.**");
    expect(bloco.type).toBe("paragraph");
  });

  it("negrito no meio do texto não vira título", () => {
    const [bloco] = parseMarkdown("O **Nation Park** é uma opção");
    expect(bloco.type).toBe("paragraph");
  });
});
