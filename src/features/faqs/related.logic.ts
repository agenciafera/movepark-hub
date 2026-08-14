import type { FaqIndexItem } from "./api";

/**
 * Perguntas relacionadas da página /faq/<slug>, em ordem de afinidade:
 * mesmo destino > mesma categoria > globais > resto. Só entra pergunta com
 * página própria (slug), porque o destino do link é a página dela.
 *
 * Determinístico de propósito: a lista sai igual no build (SSG) e no cliente,
 * senão a hidratação divergiria do HTML servido.
 */
export function pickRelatedFaqs(
  all: FaqIndexItem[],
  current: {
    id: string;
    destination_id: string | null;
    category?: { slug: string } | null;
  },
  max = 4,
): FaqIndexItem[] {
  const pool = all.filter((f) => f.slug && f.id !== current.id);

  const afinidade = (f: FaqIndexItem): number => {
    if (current.destination_id && f.destination_id === current.destination_id) return 0;
    if (current.category?.slug && f.category?.slug === current.category.slug) return 1;
    if (f.scope === "global") return 2;
    return 3;
  };

  return [...pool]
    .sort(
      (a, b) =>
        afinidade(a) - afinidade(b) ||
        a.sort_order - b.sort_order ||
        a.question.localeCompare(b.question, "pt-BR"),
    )
    .slice(0, max);
}
