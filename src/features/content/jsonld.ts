import type { ContentPage, Section } from "./types";

/**
 * JSON-LD das páginas de conteúdo.
 *
 * As respostas saem dos mesmos blocos que a tela renderiza. Structured data que
 * diverge do texto visível é motivo de penalidade do Google, e aqui a divergência
 * seria estrutural: dois lugares para o mesmo texto.
 */

/** Passos de `/como-funciona`, na ordem em que aparecem, através das seções. */
export function howToJsonLd(page: ContentPage) {
  const steps = page.sections
    .flatMap((s) => s.blocks)
    .flatMap((b) => (b.type === "steps" ? b.items : []));

  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: page.title,
    description: page.intro,
    step: steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.title,
      text: s.text,
    })),
  };
}

/**
 * Um único `FAQPage` por página, juntando todos os blocos de FAQ. Mais de um bloco
 * na mesma página continua virando um `FAQPage` só, que é o que o schema espera.
 */
export function faqJsonLd(sections: Section[]) {
  const perguntas = sections
    .flatMap((s) => s.blocks)
    .flatMap((b) => (b.type === "faq" ? b.items : []));

  if (perguntas.length === 0) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: perguntas.map((p) => ({
      "@type": "Question",
      name: p.q,
      acceptedAnswer: { "@type": "Answer", text: p.a },
    })),
  };
}
