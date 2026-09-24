import { describe, expect, it } from "vitest";

import { faqJsonLd } from "./jsonld";
import { SEGURANCA } from "./pages";
import { readingMinutes } from "./types";

/**
 * A página de segurança e seguro (24/09/2026). Nasceu da auditoria contra os dois
 * concorrentes: os dois tinham página própria para o tema e a Movepark respondia só
 * dentro de uma FAQ de destino, apesar de ser a objeção nº 1 depois do preço.
 */
describe("página de segurança e seguro", () => {
  it("responde a pergunta que o título faz, já na primeira seção", () => {
    const primeira = SEGURANCA.sections[0];
    expect(primeira.title).toMatch(/Quem responde/);
    const texto = JSON.stringify(primeira.blocks);
    // O ângulo que nenhum dos dois concorrentes usa: a base legal, que é verificável
    // e vale para qualquer pátio, com ou sem seguro contratado.
    expect(texto).toContain("Súmula 130");
    expect(texto).toContain("Código de Defesa do Consumidor");
  });

  it("declara o limite do que a Movepark verifica", () => {
    // Página de confiança que só afirma vantagem não sustenta citação. O que sustenta
    // é dizer o que NÃO se verifica.
    const secao = SEGURANCA.sections.find((s) => s.id === "o-que-verificamos");
    expect(secao).toBeDefined();
    const tabela = secao!.blocks.find((b) => b.type === "table");
    expect(tabela).toBeDefined();
    const chaves = (tabela as { rows: { k: string }[] }).rows.map((r) => r.k);
    expect(chaves).toContain("Não verificamos");
  });

  it("emite um FAQPage com as perguntas visíveis, e cada uma linka a página própria", () => {
    const schema = faqJsonLd(SEGURANCA.sections);
    expect(schema).not.toBeNull();
    expect(schema!.mainEntity).toHaveLength(5);

    const faq = SEGURANCA.sections
      .flatMap((s) => s.blocks)
      .flatMap((b) => (b.type === "faq" ? b.items : []));
    // ADR-002: a resposta do dado estruturado é idêntica à visível.
    expect(schema!.mainEntity.map((q) => q.acceptedAnswer.text)).toEqual(faq.map((f) => f.a));
    // E toda pergunta aponta para a página própria dela, que é o que alimenta a malha.
    expect(faq.every((f) => Boolean(f.slug))).toBe(true);
  });

  it("não usa travessão (regra de marca do CLAUDE.md)", () => {
    expect(JSON.stringify(SEGURANCA)).not.toMatch(/[—–]/);
  });

  it("tem corpo suficiente para ser página, e não um aviso", () => {
    expect(readingMinutes(SEGURANCA.sections)).toBeGreaterThanOrEqual(3);
  });
});
