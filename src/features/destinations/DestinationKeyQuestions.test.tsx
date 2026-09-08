import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";

import type { FaqCombinedItem } from "@/features/faqs/api";
import { DestinationKeyQuestions } from "./DestinationKeyQuestions";

function faq(over: Partial<FaqCombinedItem> = {}): FaqCombinedItem {
  return {
    id: "f1",
    scope: "destination",
    location_id: null,
    destination_id: "d1",
    question: "Vale mais a pena o estacionamento oficial de Viracopos ou um particular?",
    answer: "Depende de quantos dias o carro fica. Na diária avulsa o bolsão do oficial custa R$ 31,00.",
    sort_order: 2,
    category: null,
    slug: "vale-mais-a-pena-o-estacionamento-oficial-de-viracopos-ou-um-particular",
    body_md: [
      "## O que muda entre o oficial e o particular",
      "",
      "O oficial cobra diária fixa e o particular reduz por permanência.",
      "",
      "### A conta por duração",
      "",
      "Em 30 diárias são R$ 747,00 contra R$ 2.490,00.",
    ].join("\n"),
    ...over,
  } as FaqCombinedItem;
}

function renderIt(items: FaqCombinedItem[]) {
  return render(
    <MemoryRouter>
      <DestinationKeyQuestions items={items} />
    </MemoryRouter>,
  );
}

describe("DestinationKeyQuestions", () => {
  // A auditoria de 08/09/2026: a Bandeira Park responde 10 perguntas como seção com
  // H2 literal e a xpark 7, enquanto a nossa página tinha as mesmas perguntas presas
  // num accordion com resposta de três linhas. LLM recupera por passagem.
  it("a pergunta vira H2 literal, não rótulo de accordion", () => {
    renderIt([faq()]);

    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2.textContent).toBe(
      "Vale mais a pena o estacionamento oficial de Viracopos ou um particular?",
    );
  });

  it("a resposta curta sai visível palavra por palavra, porque é o que o FAQPage cita", () => {
    // ADR-002: a resposta do dado estruturado tem que ser idêntica à visível. Se a
    // seção mostrasse só o body_md, o FAQPage passaria a afirmar um texto que a
    // página não tem.
    const f = faq();
    renderIt([f]);

    expect(screen.getByText(f.answer)).toBeInTheDocument();
  });

  it("o corpo longo abre embaixo, sem repetir o título que já é a pergunta", () => {
    renderIt([faq()]);

    expect(screen.getByText(/O oficial cobra diária fixa/)).toBeInTheDocument();
    // O "## O que muda entre o oficial e o particular" foi escrito para a página
    // própria da pergunta; aqui ele duplicaria o H2.
    expect(screen.queryByText(/O que muda entre o oficial/)).not.toBeInTheDocument();
  });

  it("subtítulo do corpo entra como H3, para não virar irmão da pergunta", () => {
    renderIt([faq()]);

    const h3 = screen.getByRole("heading", { level: 3 });
    expect(h3.textContent).toBe("A conta por duração");
    // Um único H2 na seção: o da pergunta.
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
  });

  it("linka a página própria da pergunta quando ela existe", () => {
    renderIt([faq()]);

    expect(screen.getByRole("link", { name: /Página desta pergunta/i })).toHaveAttribute(
      "href",
      "/faq/vale-mais-a-pena-o-estacionamento-oficial-de-viracopos-ou-um-particular",
    );
  });

  it("sem slug, a seção existe e o link some", () => {
    renderIt([faq({ slug: null })]);

    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Página desta pergunta/i })).not.toBeInTheDocument();
  });

  it("sem corpo longo, mostra só a resposta curta", () => {
    const f = faq({ body_md: null });
    renderIt([f]);

    expect(screen.getByText(f.answer)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
  });

  it("lista vazia não deixa bloco órfão na página", () => {
    const { container } = renderIt([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("cada pergunta é uma seção própria, na ordem recebida", () => {
    const { container } = renderIt([
      faq({ id: "a", question: "Primeira?" }),
      faq({ id: "b", question: "Segunda?", slug: "segunda" }),
    ]);
    const secoes = container.querySelectorAll("section");
    expect(secoes).toHaveLength(2);
    expect(within(secoes[0] as HTMLElement).getByRole("heading", { level: 2 }).textContent).toBe(
      "Primeira?",
    );
    expect(within(secoes[1] as HTMLElement).getByRole("heading", { level: 2 }).textContent).toBe(
      "Segunda?",
    );
  });
});
