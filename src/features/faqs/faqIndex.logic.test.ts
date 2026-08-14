import { describe, expect, it } from "vitest";
import { buildFaqSections, filterFaqs, metaDescriptionFrom } from "./faqIndex.logic";
import type { FaqIndexItem } from "./api";

function faq(overrides: Partial<FaqIndexItem> & { id: string }): FaqIndexItem {
  return {
    scope: "global",
    destination_id: null,
    question: `Pergunta ${overrides.id}?`,
    answer: "Resposta.",
    slug: `pergunta-${overrides.id}`,
    sort_order: 0,
    category: null,
    destination: null,
    ...overrides,
  };
}

describe("filterFaqs", () => {
  const acervo = [
    faq({ id: "pix", question: "Aceita PIX?", answer: "Aceita." }),
    faq({ id: "cancel", question: "Como cancelo?", answer: "Pelo site, sem multa." }),
  ];

  it("busca na pergunta e na resposta, sem caixa", () => {
    expect(filterFaqs(acervo, "pix").map((f) => f.id)).toEqual(["pix"]);
    expect(filterFaqs(acervo, "MULTA").map((f) => f.id)).toEqual(["cancel"]);
  });

  it("consulta curta demais devolve tudo", () => {
    expect(filterFaqs(acervo, "p")).toHaveLength(2);
    expect(filterFaqs(acervo, "")).toHaveLength(2);
  });
});

describe("buildFaqSections", () => {
  it("globais por categoria na ordem do banco, destinos em ordem alfabética depois", () => {
    const sections = buildFaqSections([
      faq({ id: "g1", category: { slug: "pagamentos", label: "Pagamentos", sort_order: 2 } }),
      faq({ id: "g2", category: { slug: "reservas", label: "Reservas", sort_order: 1 } }),
      faq({
        id: "d-vcp",
        scope: "destination",
        destination_id: "vcp",
        destination: { name: "Aeroporto de Viracopos", short_name: "Viracopos", slug: "viracopos" },
      }),
      faq({
        id: "d-gru",
        scope: "destination",
        destination_id: "gru",
        destination: { name: "Aeroporto de Guarulhos", short_name: "Guarulhos", slug: "guarulhos" },
      }),
    ]);

    expect(sections.map((s) => s.id)).toEqual([
      "reservas",
      "pagamentos",
      "destino-guarulhos",
      "destino-viracopos",
    ]);
    expect(sections[2].title).toBe("Sobre Guarulhos");
  });

  it("carrega o slug no item do bloco (é ele que vira o link da página)", () => {
    const [secao] = buildFaqSections([faq({ id: "g1", slug: "como-cancelo" })]);
    const bloco = secao.blocks[0];
    if (bloco.type !== "faq") throw new Error("bloco inesperado");
    expect(bloco.items[0].slug).toBe("como-cancelo");
  });

  it("pergunta sem categoria cai em outras; sem destino não explode", () => {
    const sections = buildFaqSections([
      faq({ id: "g1", category: null }),
      faq({ id: "d1", scope: "destination", destination: null }),
    ]);
    expect(sections.map((s) => s.id)).toEqual(["outras", "destino-destino"]);
  });
});

describe("metaDescriptionFrom", () => {
  it("resposta curta passa inteira", () => {
    expect(metaDescriptionFrom("Aceita PIX e cartão.")).toBe("Aceita PIX e cartão.");
  });

  it("resposta longa corta em palavra e fecha com reticência", () => {
    const longa = "palavra ".repeat(40).trim();
    const out = metaDescriptionFrom(longa);
    expect(out.length).toBeLessThanOrEqual(161);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/palavr…$/);
  });

  it("normaliza quebras de linha em espaço", () => {
    expect(metaDescriptionFrom("Linha 1\nLinha 2")).toBe("Linha 1 Linha 2");
  });
});
