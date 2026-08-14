import { describe, expect, it } from "vitest";
import { pickRelatedFaqs } from "./related.logic";
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

describe("pickRelatedFaqs", () => {
  const GRU = "dest-gru";

  it("prioriza mesmo destino, depois mesma categoria, depois globais", () => {
    const all = [
      faq({ id: "global-solta", sort_order: 5 }),
      faq({ id: "mesma-categoria", category: { slug: "reservas", label: "Reservas", sort_order: 1 } }),
      faq({ id: "mesmo-destino", scope: "destination", destination_id: GRU }),
      faq({ id: "outro-destino", scope: "destination", destination_id: "dest-vcp" }),
    ];
    const atual = {
      id: "atual",
      destination_id: GRU,
      category: { slug: "reservas" },
    };

    const ids = pickRelatedFaqs(all, atual, 4).map((f) => f.id);
    expect(ids).toEqual(["mesmo-destino", "mesma-categoria", "global-solta", "outro-destino"]);
  });

  it("exclui a própria pergunta e as sem slug", () => {
    const all = [
      faq({ id: "atual" }),
      faq({ id: "sem-slug", slug: null }),
      faq({ id: "ok" }),
    ];
    const ids = pickRelatedFaqs(all, { id: "atual", destination_id: null }, 4).map((f) => f.id);
    expect(ids).toEqual(["ok"]);
  });

  it("respeita o máximo e desempata por sort_order", () => {
    const all = [
      faq({ id: "c", sort_order: 3 }),
      faq({ id: "a", sort_order: 1 }),
      faq({ id: "b", sort_order: 2 }),
    ];
    const ids = pickRelatedFaqs(all, { id: "x", destination_id: null }, 2).map((f) => f.id);
    expect(ids).toEqual(["a", "b"]);
  });
});
