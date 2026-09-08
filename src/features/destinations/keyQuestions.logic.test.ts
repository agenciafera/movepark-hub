import { describe, expect, it } from "vitest";

import type { KeyQuestionSource } from "./keyQuestions.logic";
import { accordionQuestions, keyQuestions, sectionBody } from "./keyQuestions.logic";

function faq(over: Partial<KeyQuestionSource> = {}): KeyQuestionSource {
  return {
    id: "1",
    scope: "destination",
    question: "As vagas em Viracopos são cobertas ou descobertas?",
    answer: "Varia por estacionamento.",
    body_md: null as string | null,
    slug: "as-vagas-em-viracopos-sao-cobertas-ou-descobertas",
    sort_order: 3,
    ...over,
  };
}

describe("keyQuestions / accordionQuestions", () => {
  const itens = [
    faq({ id: "g1", scope: "global", question: "Como faço uma reserva?", sort_order: 1 }),
    faq({ id: "d2", scope: "destination", sort_order: 5 }),
    faq({ id: "d1", scope: "destination", sort_order: 1 }),
    faq({ id: "a1", scope: "auto", sort_order: 2 }),
  ];

  it("promove só o escopo de destino, na ordem editorial", () => {
    expect(keyQuestions(itens).map((f) => f.id)).toEqual(["d1", "d2"]);
  });

  it("o que virou seção não volta no accordion (senão duplica na página e no FAQPage)", () => {
    const secao = keyQuestions(itens).map((f) => f.id);
    const accordion = accordionQuestions(itens).map((f) => f.id);
    expect(accordion).toEqual(["g1", "a1"]);
    expect(secao.some((id) => accordion.includes(id))).toBe(false);
    expect([...secao, ...accordion].sort()).toEqual(itens.map((f) => f.id).sort());
  });

  it("aguenta lista vazia e indefinida", () => {
    expect(keyQuestions(undefined)).toEqual([]);
    expect(accordionQuestions([])).toEqual([]);
  });
});

describe("sectionBody", () => {
  // O corpo real de Viracopos, como está no banco.
  const real = [
    "## Vaga coberta ou descoberta no Aeroporto de Viracopos: qual escolher",
    "",
    "No parceiro Movepark Virapark a vaga coberta sai R$ 40,00.",
    "",
    "- Coberta protege de sol forte, chuva e granizo.",
    "",
    "## Como decidir pela duração",
    "",
    "Em 30 diárias a diferença vira o preço de mais um dia.",
  ].join("\n");

  it("tira o título do corpo, porque a pergunta já é o H2 da seção", () => {
    const out = sectionBody(real)!;
    expect(out.startsWith("No parceiro Movepark Virapark")).toBe(true);
    expect(out).not.toContain("qual escolher");
  });

  it("preserva o nível dos subtítulos que sobram (quem rebaixa é o PostBody)", () => {
    // Rebaixar aqui não adiantaria: `normalizaTitulos`, no parser, sobe a hierarquia
    // de volta quando o corpo não tem nenhum h2. E manter o nível original preserva a
    // diferença entre `##` e `###` dentro do corpo, que o rebaixamento achataria.
    const out = sectionBody(real)!;
    expect(out).toContain("## Como decidir pela duração");
  });

  it("preserva a prosa e as listas", () => {
    const out = sectionBody(real)!;
    expect(out).toContain("- Coberta protege de sol forte");
    expect(out).toContain("Em 30 diárias a diferença");
  });

  it("corpo sem título nenhum passa inteiro", () => {
    expect(sectionBody("Texto simples, sem cabeçalho.")).toBe("Texto simples, sem cabeçalho.");
  });

  it("só descarta o cabeçalho quando ele abre o corpo", () => {
    // Cabeçalho depois de prosa é estrutura do texto, não título: fica (rebaixado).
    const out = sectionBody("Abre com prosa.\n\n## Um subtítulo\n\nMais prosa.")!;
    expect(out).toContain("Abre com prosa.");
    expect(out).toContain("## Um subtítulo");
  });

  it("devolve null quando não sobra conteúdo", () => {
    expect(sectionBody(null)).toBeNull();
    expect(sectionBody("   ")).toBeNull();
    expect(sectionBody("## Só o título")).toBeNull();
  });
});
