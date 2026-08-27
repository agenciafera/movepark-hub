import { describe, expect, it } from "vitest";
import { dataDeReferencia, derivarPostsSociais, semTravessao } from "./social.logic";

/**
 * Réplica reduzida da anatomia das âncoras de preço do acervo: abertura com o
 * número, tabela "Resposta rápida" de duas colunas, tabela larga de comparação,
 * lista e FAQ em `###` terminado em `?`. É esse molde que a skill
 * `blogpost-seo-geo` produz, e é dele que os quatro recortes saem.
 */
const ARTIGO = `Um estacionamento do Aeroporto Afonso Pena custa a partir de R$ 118,30 por sete diárias em 27 de agosto de 2026.

| Resposta rápida | Valor em 27/08/2026 |
| --- | --- |
| Menor semana | R$ 118,30, ou R$ 16,90 por dia |
| Menor quinzena | R$ 238,50, ou R$ 15,90 por dia |
| Permanência mínima | 3 diárias, nos dois pátios |

## Quanto custa o estacionamento hoje

Dois pátios parceiros operam ali.

| Pátio e tipo de vaga | Distância do terminal | 7 diárias | 30 diárias |
| --- | --- | --- | --- |
| Abbapark, descoberta | 2,6 km | R$ 118,30 | R$ 477,00 |
| Abbapark, coberta | 2,6 km | R$ 153,30 | R$ 627,00 |
| Nationpark, descoberta | 1,4 km | R$ 139,30 | R$ 567,00 |

## O que somar além do preço

- Confira a distância do pátio até o terminal
- Some o tempo de traslado na conta da viagem
- Veja se a vaga coberta compensa no seu caso
- Cheque a permanência mínima antes de fechar
- Leve o número do voo para o embarque no traslado

## Perguntas frequentes

### Quanto custa a menor estadia possível no Afonso Pena?

A menor estadia é de três diárias, porque os dois pátios cobram esse piso. Sai R$ 50,70 na vaga descoberta do Abbapark.

### O preço por dia cai em estadia longa?

Cai pouco em Curitiba. Entre sete e trinta diárias a diária cede R$ 1,00 na vaga descoberta.
`;

const FONTE = {
  title: "Quanto custa um estacionamento do Aeroporto Afonso Pena",
  slug: "quanto-custa-um-estacionamento-do-aeroporto-afonso-pena",
  bodyMd: ARTIGO,
  destinationName: "Aeroporto Afonso Pena",
  destinationSlug: "aeroporto-afonso-pena",
};

describe("dataDeReferencia", () => {
  it("lê a data numérica do cabeçalho da tabela", () => {
    expect(dataDeReferencia("| Resposta rápida | Valor em 27/08/2026 |")).toBe("27/08/2026");
  });

  it("lê a data por extenso da prosa", () => {
    expect(dataDeReferencia("consultados em 3 de janeiro de 2026")).toBe("03/01/2026");
  });

  it("devolve null quando o artigo não datou nada", () => {
    expect(dataDeReferencia("A diária sai por R$ 16,90.")).toBeNull();
  });
});

describe("semTravessao", () => {
  it("troca travessão e traço por hífen com espaços", () => {
    expect(semTravessao("Guarulhos — o mais caro")).toBe("Guarulhos - o mais caro");
    expect(semTravessao("7–30 diárias")).toBe("7 - 30 diárias");
  });
});

describe("derivarPostsSociais", () => {
  it("recorta os quatro formatos de um artigo completo", () => {
    const { drafts, gaps } = derivarPostsSociais(FONTE);

    expect(gaps).toEqual([]);
    expect(drafts.map((d) => d.format)).toEqual([
      "ancora-de-preco",
      "pergunta",
      "comparativo",
      "checklist",
    ]);
  });

  it("nenhum recorte sai bloqueado num artigo que segue a skill", () => {
    const { drafts } = derivarPostsSociais(FONTE);
    expect(drafts.flatMap((d) => d.blockers)).toEqual([]);
  });

  it("a âncora de preço usa o valor da tabela, sem recalcular nada", () => {
    const ancora = derivarPostsSociais(FONTE).drafts.find((d) => d.format === "ancora-de-preco")!;

    expect(ancora.cards[0].title).toBe("R$ 118,30, ou R$ 16,90 por dia");
    expect(ancora.cards[0].body).toBe("Menor semana");
    expect(ancora.priceDate).toBe("27/08/2026");
    expect(ancora.cards[0].eyebrow).toBe("Aeroporto Afonso Pena, 27/08/2026");
  });

  it("a pergunta sai da FAQ que a página já emite como FAQPage", () => {
    const pergunta = derivarPostsSociais(FONTE).drafts.find((d) => d.format === "pergunta")!;

    expect(pergunta.cards[0].title).toBe("Quanto custa a menor estadia possível no Afonso Pena?");
    expect(pergunta.cards[1].title).toContain("três diárias");
  });

  it("o comparativo usa a tabela mais larga, uma linha por card", () => {
    const comparativo = derivarPostsSociais(FONTE).drafts.find((d) => d.format === "comparativo")!;

    // Capa mais as três linhas da tabela de quatro colunas.
    expect(comparativo.cards).toHaveLength(4);
    expect(comparativo.cards[1].title).toBe("Abbapark, descoberta");
    expect(comparativo.cards[1].body).toContain("7 diárias: R$ 118,30");
  });

  it("o checklist usa a maior lista do artigo", () => {
    const checklist = derivarPostsSociais(FONTE).drafts.find((d) => d.format === "checklist")!;

    expect(checklist.source).toContain("Maior lista");
    expect(checklist.label).toBe("Checklist");
    expect(checklist.cards[1].title).toBe("Confira a distância do pátio até o terminal");
    expect(checklist.cards[1].eyebrow).toBe("1");
  });

  it("a âncora de preço descarta a linha da tabela que não é preço", () => {
    const ancora = derivarPostsSociais(FONTE).drafts.find((d) => d.format === "ancora-de-preco")!;

    // A "Resposta rápida" mistura preço com permanência mínima; só o preço vira card.
    expect(ancora.cards).toHaveLength(2);
    expect(ancora.cards.map((c) => c.title)).not.toContain("3 diárias, nos dois pátios");
  });

  it("não assina data de referência na legenda de recorte sem preço", () => {
    const semPreco = {
      ...FONTE,
      bodyMd: ARTIGO.replace(/^- .*$/gm, "").replace(
        "## O que somar além do preço",
        "## O que somar além do preço\n\n## Como estes preços foram apurados\n\nTexto.\n\n## Quanto tempo leva o traslado\n\nTexto.\n",
      ),
    };

    const roteiro = derivarPostsSociais(semPreco).drafts.find((d) => d.format === "checklist")!;
    expect(roteiro.priceDate).toBeNull();
    expect(roteiro.caption).not.toContain("Valores consultados");
  });

  it("toda legenda leva a URL do post, que é a premissa da distribuição", () => {
    const { drafts } = derivarPostsSociais(FONTE);
    for (const d of drafts) {
      expect(d.caption).toContain(`/blog/${FONTE.slug}/`);
    }
  });

  it("a legenda com preço carrega a data de referência", () => {
    const ancora = derivarPostsSociais(FONTE).drafts.find((d) => d.format === "ancora-de-preco")!;
    expect(ancora.caption).toContain("Valores consultados em 27/08/2026");
  });

  it("bloqueia o recorte que promete transação (ADR-009)", () => {
    const comPromessa = {
      ...FONTE,
      bodyMd: ARTIGO.replace(
        "Confira a distância do pátio até o terminal",
        "Vaga garantida na chegada, sem fila",
      ),
    };

    const checklist = derivarPostsSociais(comPromessa).drafts.find(
      (d) => d.format === "checklist",
    )!;
    expect(checklist.blockers).toHaveLength(1);
    expect(checklist.blockers[0]).toContain("vaga garantida");
    expect(checklist.blockers[0]).toContain("ADR-009");
  });

  it("bloqueia valor em R$ sem data de referência no artigo", () => {
    const semData = { ...FONTE, bodyMd: ARTIGO.replace(/27\/08\/2026|27 de agosto de 2026/g, "") };

    const ancora = derivarPostsSociais(semData).drafts.find((d) => d.format === "ancora-de-preco")!;
    expect(ancora.priceDate).toBeNull();
    expect(ancora.blockers.join(" ")).toContain("data de referência");
  });

  it("normaliza o travessão do acervo herdado do WordPress", () => {
    const legado = {
      ...FONTE,
      bodyMd: ARTIGO.replace("| Menor semana |", "| Menor semana — na baixa |"),
    };

    const ancora = derivarPostsSociais(legado).drafts.find((d) => d.format === "ancora-de-preco")!;
    expect(ancora.cards[0].body).toBe("Menor semana - na baixa");
    expect(JSON.stringify(ancora)).not.toMatch(/[—–]/);
  });

  it("declara o formato que o artigo não sustenta em vez de inventar card", () => {
    const magro = {
      ...FONTE,
      bodyMd: "## Uma seção só\n\nUm parágrafo curto, sem tabela, sem lista e sem FAQ.\n",
    };

    const { drafts, gaps } = derivarPostsSociais(magro);
    expect(drafts).toEqual([]);
    expect(gaps.map((g) => g.format)).toEqual([
      "ancora-de-preco",
      "pergunta",
      "comparativo",
      "checklist",
    ]);
    expect(gaps[0].reason).toContain("tabela");
    expect(gaps[1].reason).toContain("FAQ");
  });

  it("cai nas seções em H2 quando o artigo não tem lista", () => {
    const semLista = {
      ...FONTE,
      bodyMd: ARTIGO.replace(/^- .*$/gm, "").replace(
        "## O que somar além do preço",
        "## O que somar além do preço\n\n## Como estes preços foram apurados\n\nTexto.\n",
      ),
    };

    const checklist = derivarPostsSociais(semLista).drafts.find((d) => d.format === "checklist")!;
    expect(checklist.source).toContain("Seções em H2");
    expect(checklist.label).toBe("O que o post responde");
    expect(checklist.cards.length).toBeGreaterThan(1);
  });

  it("a hashtag do destino sai do nome curto, numa tag só", () => {
    const { drafts } = derivarPostsSociais({ ...FONTE, destinationShortName: "Afonso Pena" });
    expect(drafts[0].caption).toContain("#afonsopena");
    expect(drafts[0].caption).not.toContain("#afonso #pena");
  });

  it("respeita o teto de seis cards por carrossel", () => {
    const linhas = Array.from(
      { length: 12 },
      (_, i) => `| Pátio ${i + 1} | ${i} km | R$ ${100 + i},00 | R$ ${400 + i},00 |`,
    ).join("\n");
    const largo = {
      ...FONTE,
      bodyMd: ARTIGO.replace("| Nationpark, descoberta | 1,4 km | R$ 139,30 | R$ 567,00 |", linhas),
    };

    for (const draft of derivarPostsSociais(largo).drafts) {
      expect(draft.cards.length).toBeLessThanOrEqual(6);
    }
  });
});
