import { describe, expect, it } from "vitest";

import { faqDaPaginaDeDestino, perguntasFaltandoNoMd } from "./faq-camadas.mjs";

const dest = (question, sort_order, slug = "aeroporto-congonhas") => ({
  scope: "destination",
  question,
  sort_order,
  destination: { slug },
});
const glob = (question, sort_order, cat = 1) => ({
  scope: "global",
  question,
  sort_order,
  category: { sort_order: cat },
});

describe("faqDaPaginaDeDestino", () => {
  it("traz as globais junto das do destino (regressão: o .md de Congonhas tinha 12 de 21)", () => {
    const faqs = [dest("Tem traslado?", 1), glob("Como cancelo?", 1), glob("Posso pagar com PIX?", 2)];
    const { doDestino, gerais } = faqDaPaginaDeDestino(faqs, "aeroporto-congonhas");
    expect(doDestino.map((f) => f.question)).toEqual(["Tem traslado?"]);
    expect(gerais.map((f) => f.question)).toEqual(["Como cancelo?", "Posso pagar com PIX?"]);
  });

  it("não traz FAQ de outro destino", () => {
    const faqs = [dest("Tem traslado?", 1, "aeroporto-guarulhos"), glob("Como cancelo?", 1)];
    const { doDestino, gerais } = faqDaPaginaDeDestino(faqs, "aeroporto-congonhas");
    expect(doDestino).toEqual([]);
    expect(gerais).toHaveLength(1);
  });

  it("pergunta repetida fica só na camada do destino (ADR-002)", () => {
    const faqs = [glob(" Como cancelo? ", 1), dest("como cancelo?", 1)];
    const { doDestino, gerais } = faqDaPaginaDeDestino(faqs, "aeroporto-congonhas");
    expect(doDestino).toHaveLength(1);
    expect(gerais).toEqual([]);
  });

  it("ordena as do destino por sort_order e as gerais por categoria e sort_order, como a página", () => {
    const faqs = [
      dest("B", 2),
      dest("A", 1),
      glob("G3", 1, 2),
      glob("G2", 2, 1),
      glob("G1", 1, 1),
    ];
    const { doDestino, gerais } = faqDaPaginaDeDestino(faqs, "aeroporto-congonhas");
    expect(doDestino.map((f) => f.question)).toEqual(["A", "B"]);
    expect(gerais.map((f) => f.question)).toEqual(["G1", "G2", "G3"]);
  });
});

describe("perguntasFaltandoNoMd", () => {
  const md = [
    "# Estacionamento Aeroporto Congonhas",
    "",
    "### Isto não é FAQ?",
    "",
    "## Perguntas frequentes",
    "",
    "### Tem traslado?",
    "",
    "## Perguntas gerais sobre reservar pela Movepark",
    "",
    "### Como cancelo?",
  ].join("\n");

  it("aceita quando toda pergunta do FAQPage está no .md, nas duas camadas", () => {
    expect(perguntasFaltandoNoMd(["Tem traslado?", " como cancelo? "], md)).toEqual([]);
  });

  it("aponta a pergunta que só existe no HTML", () => {
    expect(perguntasFaltandoNoMd(["Tem traslado?", "Posso pagar com PIX?"], md)).toEqual([
      "Posso pagar com PIX?",
    ]);
  });

  it("título com ? fora da seção de FAQ não conta", () => {
    expect(perguntasFaltandoNoMd(["Isto não é FAQ?"], md)).toEqual(["Isto não é FAQ?"]);
  });
});
