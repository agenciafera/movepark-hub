import type { Section } from "@/features/content/types";
import type { FaqIndexItem } from "./api";

/**
 * Lógica pura do hub /faq. Fica fora do componente porque roda igual no build
 * (SSG) e no cliente, e porque busca e agrupamento são regra testável, não UI.
 */

/** Busca em memória sobre pergunta E resposta (o acervo inteiro já veio do loader). */
export function filterFaqs(faqs: FaqIndexItem[], query: string): FaqIndexItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return faqs;
  return faqs.filter(
    (f) => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q),
  );
}

/**
 * Seções do hub: globais agrupadas por categoria (ordem do banco), depois uma
 * seção por destino, em ordem alfabética. A âncora de categoria (`#reservas`)
 * segue valendo pros links antigos `?cat=`; destino ganha `#destino-<slug>`.
 */
export function buildFaqSections(faqs: FaqIndexItem[]): Section[] {
  const porCategoria = new Map<
    string,
    { label: string; ordem: number; itens: { q: string; a: string; slug?: string }[] }
  >();
  const porDestino = new Map<
    string,
    { label: string; itens: { q: string; a: string; slug?: string }[] }
  >();

  for (const f of faqs) {
    const item = { q: f.question, a: f.answer, slug: f.slug ?? undefined };
    if (f.scope === "destination") {
      const key = f.destination?.slug ?? "destino";
      const atual = porDestino.get(key) ?? {
        label: f.destination?.short_name ?? f.destination?.name ?? "Destinos",
        itens: [],
      };
      atual.itens.push(item);
      porDestino.set(key, atual);
    } else {
      const slug = f.category?.slug ?? "outras";
      const atual = porCategoria.get(slug) ?? {
        label: f.category?.label ?? "Outras dúvidas",
        ordem: f.category?.sort_order ?? 999,
        itens: [],
      };
      atual.itens.push(item);
      porCategoria.set(slug, atual);
    }
  }

  const globais: Section[] = [...porCategoria.entries()]
    .sort((a, b) => a[1].ordem - b[1].ordem)
    .map(([slug, c]) => ({
      id: slug,
      title: c.label,
      blocks: [{ type: "faq" as const, items: c.itens }],
    }));

  const destinos: Section[] = [...porDestino.entries()]
    .sort((a, b) => a[1].label.localeCompare(b[1].label, "pt-BR"))
    .map(([slug, c]) => ({
      id: `destino-${slug}`,
      title: `Sobre ${c.label}`,
      blocks: [{ type: "faq" as const, items: c.itens }],
    }));

  return [...globais, ...destinos];
}

/** Meta description derivada da resposta: corte em palavra, nunca no meio dela. */
export function metaDescriptionFrom(answer: string, max = 160): string {
  const flat = answer.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : max).trimEnd()}…`;
}
