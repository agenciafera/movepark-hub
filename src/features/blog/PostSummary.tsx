import * as React from "react";
import { CaretDown } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { sectionsFrom } from "./markdown.logic";

type Props = {
  /** Resumo do post, quando existe um escrito. */
  resumo: string | null;
  /** Corpo em markdown, de onde sai a lista de seções. */
  bodyMd: string;
};

/**
 * Bloco recolhível no topo do corpo, com duas fontes e uma regra de precedência.
 *
 * Com resumo, ele mostra o resumo. Sem resumo, mostra a lista de seções do post,
 * que sai dos `h2` do próprio corpo. As duas respondem à mesma pergunta de quem
 * chega de busca ("o que tem aqui dentro?"), e é por isso que dividem um bloco
 * só em vez de virarem dois que competem pelo mesmo lugar.
 *
 * Nasce fechado. Aberto por padrão, ele empurra o primeiro parágrafo para fora
 * da tela, que é justamente o que o cabeçalho em duas colunas foi arrumar.
 */
export function PostSummary({ resumo, bodyMd }: Props) {
  const [aberto, setAberto] = React.useState(false);
  const secoes = React.useMemo(() => (resumo ? [] : sectionsFrom(bodyMd)), [resumo, bodyMd]);
  const id = React.useId();

  // Índice de uma seção só não é índice, é o título repetido.
  if (!resumo && secoes.length < 2) return null;

  return (
    <div className="mb-8 overflow-hidden rounded-2xl border border-hairline print:hidden">
      <h2>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-controls={id}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        >
          <span className="text-title-md text-ink">{resumo ? "Ver resumo" : "Nesta página"}</span>
          <CaretDown
            className={cn(
              "h-5 w-5 shrink-0 text-muted transition-transform duration-200 motion-reduce:transition-none",
              aberto && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </h2>

      <div id={id} hidden={!aberto} className="border-t border-hairline px-5 py-4">
        {resumo ? (
          <p className="text-body-md leading-[1.7] text-body">{resumo}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {secoes.map((s, i) => (
              <li key={s.id} className="flex gap-3">
                <span className="text-caption-sm font-bold tabular-nums text-muted" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <a
                  href={`#${s.id}`}
                  onClick={() => setAberto(false)}
                  className="text-body-sm text-body hover:text-ink hover:underline"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
