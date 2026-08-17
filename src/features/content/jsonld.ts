import type { Section } from "./types";

/**
 * JSON-LD das páginas de conteúdo.
 *
 * As respostas saem dos mesmos blocos que a tela renderiza. Structured data que
 * diverge do texto visível é motivo de penalidade do Google, e aqui a divergência
 * seria estrutural: dois lugares para o mesmo texto.
 *
 * O `HowTo` morava aqui e saiu em 17/08/2026, quando a /como-funciona deixou de
 * ser página de conteúdo. Os sete passos dela viraram dados próprios, e o schema
 * passou a sair de `features/how-it-works/journey.ts`, junto do texto visível.
 */

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
