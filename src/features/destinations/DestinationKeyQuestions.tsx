import { Link } from "react-router-dom";

import { PostBody } from "@/features/blog/PostBody";
import type { FaqCombinedItem } from "@/features/faqs/api";

import { sectionBody } from "./keyQuestions.logic";

/**
 * As perguntas do aeroporto como SEÇÃO, não como linha de accordion.
 *
 * Cada pergunta vira um `<h2>` literal, com a resposta curta em destaque e o corpo
 * longo aberto embaixo. É a forma que a auditoria de 08/09/2026 mostrou faltar: os
 * dois concorrentes de Viracopos respondem em seção (10 e 7 perguntas), e a nossa
 * página tinha as mesmas perguntas escondidas num accordion com resposta de três
 * linhas. LLM recupera por passagem, e a passagem mais citável é a que tem a
 * pergunta do usuário no cabeçalho e o argumento inteiro embaixo.
 *
 * **A `answer` fica visível literal, e é ela que o `FAQPage` afirma** (ADR-002: a
 * resposta do dado estruturado tem que ser idêntica à visível). O `body_md` entra
 * como aprofundamento embaixo, nunca no lugar dela.
 *
 * O accordion não some: as perguntas de plataforma (escopo `global`) continuam lá,
 * porque se repetem em toda página e não merecem H2 próprio.
 */
export function DestinationKeyQuestions({
  items,
  intro,
}: {
  items: FaqCombinedItem[];
  /** Frase curta acima do bloco. Some quando não há nada a dizer. */
  intro?: string | null;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mt-12 flex flex-col gap-10">
      {intro && <p className="text-body-md text-muted">{intro}</p>}
      {items.map((f) => {
        const corpo = sectionBody(f.body_md);
        return (
          <section key={f.id} className="scroll-mt-24">
            <h2 className="text-balance text-display-md text-ink">{f.question}</h2>
            {/* Resposta curta em destaque: é a que o FAQPage cita, então tem que
                estar visível palavra por palavra. */}
            <p className="mt-3 text-pretty text-body-md text-body">{f.answer}</p>
            {corpo && (
              <div className="mt-2">
                <PostBody markdown={corpo} minHeadingLevel={3} />
              </div>
            )}
            {f.slug && (
              <Link
                to={`/faq/${f.slug}`}
                className="mt-3 inline-block text-body-sm font-medium text-mp-indigo underline-offset-2 hover:underline"
              >
                Página desta pergunta
              </Link>
            )}
          </section>
        );
      })}
    </div>
  );
}
