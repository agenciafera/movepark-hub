import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { FaqList } from "./FaqList";
import type { FaqCombinedItem } from "./api";

function item(overrides: Partial<FaqCombinedItem> & { id: string }): FaqCombinedItem {
  return {
    scope: "global",
    location_id: null,
    destination_id: null,
    question: `Pergunta ${overrides.id}?`,
    answer: `Resposta ${overrides.id}.`,
    sort_order: 0,
    category: null,
    slug: null,
    ...overrides,
  };
}

describe("FaqList", () => {
  /**
   * Regressão do forceMount: o Radix desmontava o conteúdo fechado, então a
   * resposta não existia no DOM até o clique. Crawler não clica em accordion; a
   * resposta precisa estar na árvore desde o primeiro render.
   */
  it("mantém a resposta no DOM com o accordion fechado", () => {
    renderWithProviders(<FaqList items={[item({ id: "pix" })]} />);
    expect(screen.getByText("Resposta pix.")).toBeInTheDocument();
  });

  it("linka a página da pergunta quando ela tem slug", () => {
    const { container } = renderWithProviders(
      <FaqList
        items={[item({ id: "com", slug: "como-cancelo" }), item({ id: "sem", slug: null })]}
      />,
    );
    const links = [...container.querySelectorAll('a[href^="/faq/"]')];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/faq/como-cancelo"]);
  });
});
