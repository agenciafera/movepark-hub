import * as React from "react";
import { Link } from "react-router-dom";
import { CalendarBlank, CaretDown, CaretRight, Clock, FileText, ListNumbers, Printer } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BlockView } from "./Blocks";
import { useActiveSection } from "./useActiveSection";
import { formatUpdated, type Section } from "./types";

type Related = { to: string; title: string; description: string };

type Props = {
  /** Migalha e h1. */
  label: string;
  title: string;
  intro: string;
  /** ISO da última revisão. Ausente some da meta row em vez de mostrar vazio. */
  updated?: string | null;
  readMinutes: number;
  sections: Section[];
  related?: Related[];
  /** Corpo alternativo pras páginas cujo texto vem em HTML do banco. */
  children?: React.ReactNode;
  /** Entra acima das seções (busca, skeleton, estado vazio). */
  bodyTop?: React.ReactNode;
  /** Ação principal da página, quando ela tem uma (ex.: buscar vaga). */
  primaryCta?: { label: string; to: string };
};

/**
 * Casca das páginas de conteúdo (termos, cancelamento, FAQ, como funciona).
 *
 * Uma casca só, porque a diferença entre essas páginas é o tipo de bloco, não o
 * layout. O que ela resolve: hierarquia, medida de leitura, índice com posição e
 * uma versão imprimível, que documento legal precisa ter.
 *
 * Quando `children` vem, o corpo é ele (caso dos documentos do banco, que chegam
 * como HTML pronto). Senão, o corpo são as `sections`.
 */
export function ContentPageView({
  label,
  title,
  intro,
  updated,
  readMinutes,
  sections,
  related = [],
  children,
  bodyTop,
  primaryCta,
}: Props) {
  const ids = React.useMemo(() => sections.map((s) => s.id), [sections]);
  const ativa = useActiveSection(ids);
  const [menuAberto, setMenuAberto] = React.useState(false);
  const secaoAtual = sections.find((s) => s.id === ativa) ?? sections[0];

  return (
    <div>
      {/* Hero */}
      <div className="border-b border-hairline bg-surface-soft">
        <div className="mx-auto w-full max-w-[1080px] px-5 py-8 desktop:px-8 desktop:py-12">
          <nav aria-label="Você está em" className="text-caption-sm text-muted">
            <Link to="/" className="hover:text-ink hover:underline">
              Início
            </Link>
            <span aria-hidden> / </span>
            <span className="text-ink">{label}</span>
          </nav>

          <h1 className="mt-3 max-w-[16ch] text-display-xl text-ink desktop:text-display-2xl">
            {title}
          </h1>
          <p className="mt-3 max-w-[56ch] text-body-md leading-relaxed text-body">{intro}</p>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-caption-sm text-muted">
            {updated && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarBlank className="h-4 w-4 shrink-0" aria-hidden />
                Atualizado em <time dateTime={updated}>{formatUpdated(updated)}</time>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4 shrink-0" aria-hidden />
              {readMinutes} min de leitura
            </span>
            {sections.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <ListNumbers className="h-4 w-4 shrink-0" aria-hidden />
                {sections.length} {sections.length === 1 ? "seção" : "seções"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Índice do mobile: preso abaixo da topbar, mostrando onde o leitor está. */}
      {sections.length > 1 && (
        <div className="sticky top-16 z-20 border-b border-hairline bg-canvas print:hidden desktop:hidden">
          <button
            type="button"
            onClick={() => setMenuAberto((v) => !v)}
            aria-expanded={menuAberto}
            className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
          >
            <span className="min-w-0">
              <span className="block text-[11px] font-bold uppercase tracking-[0.4px] text-muted">
                Nesta página
              </span>
              <span className="block truncate text-body-sm font-semibold text-ink">
                {secaoAtual?.title}
              </span>
            </span>
            <CaretDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted transition-transform duration-200 motion-reduce:transition-none",
                menuAberto && "rotate-180",
              )}
              aria-hidden
            />
          </button>
          {menuAberto && (
            <nav
              aria-label="Nesta página"
              className="max-h-[46vh] overflow-y-auto border-t border-hairline bg-canvas shadow-tier"
            >
              <ul>
                {sections.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      onClick={() => setMenuAberto(false)}
                      className={cn(
                        "block px-5 py-2.5 text-body-sm",
                        s.id === ativa
                          ? "bg-surface-pale font-semibold text-ink"
                          : "text-muted hover:text-ink",
                      )}
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      )}

      <div className="mx-auto w-full max-w-[1080px] px-5 py-8 desktop:px-8 desktop:py-12">
        <div className="grid grid-cols-1 gap-0 desktop:grid-cols-[260px_1fr] desktop:gap-14">
          {/* Índice do desktop. Âncoras de verdade: deep link tem que dar pra copiar. */}
          {sections.length > 1 && (
            <div className="hidden print:hidden desktop:block">
              <nav aria-label="Nesta página" className="sticky top-24">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.4px] text-muted">
                  Nesta página
                </p>
                <ul>
                  {sections.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className={cn(
                          "block border-l-2 py-1.5 pl-3 text-caption-sm transition-colors",
                          s.id === ativa
                            ? "border-mp-navy font-bold text-ink"
                            : "border-hairline font-medium text-muted hover:text-ink",
                        )}
                      >
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="mt-5 inline-flex items-center gap-2 rounded-full border border-hairline px-4 py-2 text-caption-sm font-semibold text-ink transition-colors hover:bg-surface-soft"
                >
                  <Printer className="h-4 w-4" aria-hidden />
                  Imprimir
                </button>
              </nav>
            </div>
          )}

          <div className="min-w-0">
            {bodyTop}
            {children ?? (
              <div>
                {sections.map((s, i) => (
                  <section
                    key={s.id}
                    id={s.id}
                    // A âncora precisa parar abaixo da topbar sticky.
                    className={cn(
                      "scroll-mt-24",
                      i === 0 ? "pb-7" : "border-t border-hairline py-7",
                    )}
                  >
                    <div className="flex gap-4">
                      <span
                        className="hidden pt-1 text-caption-sm font-bold tabular-nums text-muted-steel tablet:block"
                        aria-hidden
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {/* `flex-1` porque flex item sem grow encolhe até o conteúdo: um
                          bloco de linha curta (accordion, tabela) ficaria mais estreito
                          que a medida de leitura e a régua pararia no meio da página. */}
                      <div className="flex min-w-0 max-w-[68ch] flex-1 flex-col gap-3.5">
                        <h2 className="text-display-sm text-ink desktop:text-display-md">
                          {s.title}
                        </h2>
                        {s.blocks.map((b, bi) => (
                          <BlockView key={bi} block={b} />
                        ))}
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            )}

            {/* A ação da própria página vem antes do suporte: numa página de topo
                de funil, mandar pro contato no lugar da busca perde a visita. */}
            {primaryCta && (
              <div className="mt-10 print:hidden">
                <Button asChild>
                  <Link to={primaryCta.to}>{primaryCta.label}</Link>
                </Button>
              </div>
            )}

            {/* Saída pra quem não achou o que procurava. */}
            <section className="mt-8 rounded-lg border border-hairline bg-canvas p-6 shadow-tier print:hidden">
              <h2 className="text-title-md text-ink">Ficou alguma dúvida?</h2>
              <p className="mt-2 text-body-sm leading-relaxed text-muted">
                Se não encontrou o que precisava aqui, fala com a gente.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button asChild>
                  <Link to="/contato">Fale conosco</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/ajuda">Central de Ajuda</Link>
                </Button>
              </div>
            </section>

            {related.length > 0 && (
              <section className="mt-8 border-t border-hairline pt-6 print:hidden">
                <p className="text-[11px] font-bold uppercase tracking-[0.4px] text-muted">
                  Veja também
                </p>
                <ul className="mt-4 grid grid-cols-1 gap-3 tablet:grid-cols-2">
                  {related.map((r) => (
                    <li key={r.to}>
                      <Link
                        to={r.to}
                        className="flex items-start gap-3 rounded-md border border-hairline p-4 transition-colors hover:border-mp-navy hover:bg-surface-soft"
                      >
                        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-body-sm font-semibold text-ink">
                            {r.title}
                          </span>
                          <span className="mt-0.5 block text-caption-sm text-muted">
                            {r.description}
                          </span>
                        </span>
                        <CaretRight className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
