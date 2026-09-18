import * as React from "react";
import { Link } from "react-router-dom";
import { CaretDown, Info } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { Block } from "./types";

/**
 * Os seis tipos de bloco das páginas de conteúdo.
 *
 * A medida do texto é 68ch e vem do container da seção, não daqui: é a decisão que
 * mais muda a leitura de documento longo. Linha larga é o que faz texto jurídico
 * parecer ilegível mesmo quando é curto.
 */
export function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "p":
      // `leading-[1.7]` é mais folgado que o resto do produto de propósito: aqui o
      // texto é pra ler inteiro, não pra escanear.
      return <p className="text-pretty text-body-md leading-[1.7] text-body">{block.text}</p>;

    case "list":
      return (
        <ul className="flex flex-col gap-2.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span
                className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-mp-navy/40"
                aria-hidden
              />
              <span className="text-body-md leading-[1.65] text-body">{item}</span>
            </li>
          ))}
        </ul>
      );

    case "note":
      return (
        <div className="flex gap-3 rounded-md border border-hairline bg-surface-pale p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-mp-indigo" aria-hidden />
          <div className="min-w-0">
            <p className="text-caption font-bold text-mp-indigo">{block.label}</p>
            <p className="mt-1 text-body-sm leading-relaxed text-body">{block.text}</p>
          </div>
        </div>
      );

    case "table":
      return (
        <dl className="overflow-hidden rounded-md border border-hairline">
          {block.rows.map((row, i) => (
            <div
              key={i}
              className={cn(
                "grid grid-cols-1 gap-1 px-4 py-3 tablet:grid-cols-[180px_1fr] tablet:gap-4",
                i > 0 && "border-t border-hairline",
              )}
            >
              <dt className="text-body-sm font-semibold text-ink">{row.k}</dt>
              <dd className="text-body-sm text-body">{row.v}</dd>
            </div>
          ))}
        </dl>
      );

    case "faq":
      return <FaqBlock items={block.items} />;

    case "steps":
      return (
        <ol className="flex flex-col gap-3">
          {block.items.map((item) => (
            <li
              key={item.n}
              className="flex gap-3 rounded-md border border-hairline bg-canvas p-4"
            >
              <span
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-mp-navy text-caption font-bold text-white tabular-nums"
                aria-hidden
              >
                {item.n}
              </span>
              <div className="min-w-0">
                <p className="text-title-sm font-semibold text-ink">{item.title}</p>
                <p className="mt-1 text-body-sm leading-relaxed text-body">{item.text}</p>
              </div>
            </li>
          ))}
        </ol>
      );
  }
}

/**
 * Accordion do FAQ: um aberto por vez.
 *
 * Não usa `<details>` porque só um pode ficar aberto, e o estado precisa vir de
 * fora do DOM. Na impressão todos abrem, por isso a resposta some com `hidden` em
 * vez de deixar de existir na árvore.
 */
function FaqBlock({ items }: { items: { q: string; a: string; slug?: string }[] }) {
  const [aberto, setAberto] = React.useState<number | null>(null);
  const base = React.useId();

  return (
    <div className="flex flex-col">
      {items.map((item, i) => {
        const on = aberto === i;
        return (
          <div key={i} className={cn(i > 0 && "border-t border-hairline")}>
            <h3>
              <button
                type="button"
                onClick={() => setAberto(on ? null : i)}
                aria-expanded={on}
                aria-controls={`${base}-${i}`}
                className="flex w-full items-start justify-between gap-4 py-4 text-left"
              >
                <span className="text-body-md font-semibold text-ink">{item.q}</span>
                <CaretDown
                  className={cn(
                    "mt-0.5 h-[18px] w-[18px] shrink-0 text-muted transition-transform duration-200 motion-reduce:transition-none",
                    on && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
            </h3>
            <div
              id={`${base}-${i}`}
              hidden={!on}
              className="max-w-[64ch] pb-4 text-body-sm leading-[1.65] text-body print:!block"
            >
              {item.a}
              {item.slug && (
                <Link
                  to={`/faq/${item.slug}`}
                  className="mt-2 block text-body-sm font-medium text-mp-indigo underline-offset-2 hover:underline print:hidden"
                >
                  Página desta pergunta
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
