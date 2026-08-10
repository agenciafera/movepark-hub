import * as React from "react";
import { CaretDown } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";

type Props = {
  total: number;
  /** Linha curta sob o total: duração e tarifa. */
  subtitle: string;
  /** Ação principal do passo. Ausente nos passos que já têm botão no formulário. */
  cta?: React.ReactNode;
  /** Conteúdo do painel (o resumo completo da reserva). */
  children: React.ReactNode;
};

/**
 * Resumo do mobile como gaveta presa no rodapé.
 *
 * Substitui o par "card colapsável no fim do conteúdo + barra de Continuar solta".
 * Nesse par o cliente precisava rolar o passo inteiro pra achar quanto ia pagar, e
 * o detalhe aberto empurrava a página pra baixo da barra fixa.
 *
 * A regra do desenho: o total e o CTA nunca saem da tela. O painel abre PRA CIMA
 * deles, não por cima. É o comportamento de checkout de e-commerce (Shopify, iFood,
 * Booking), onde o valor fica sempre à mão e o detalhe é opcional.
 *
 * `sticky` em vez de `fixed` de propósito: preso no rodapé enquanto há conteúdo
 * abaixo, e acomodado no fim da página quando ela acaba. Com `fixed` seria preciso
 * um espaçador no conteúdo pra última linha não sumir atrás da barra, que é
 * justamente o remendo que esta gaveta remove.
 */
export function SummaryDrawer({ total, subtitle, cta, children }: Props) {
  const [open, setOpen] = React.useState(false);
  const painelId = React.useId();

  return (
    <>
      {/* Escurece o conteúdo e fecha no toque fora, como qualquer sheet. */}
      {open && (
        <button
          type="button"
          aria-label="Fechar detalhes"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-mp-navy/55 desktop:hidden"
        />
      )}

      <div
        className={cn(
          "sticky bottom-0 z-50 border-t border-hairline bg-canvas transition-[border-radius] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none desktop:hidden",
          open && "rounded-t-lg shadow-[0_-8px_24px_0_rgba(41,38,63,0.10)]",
        )}
      >
        {/* Anima `max-height` pra abrir sem empurrar o layout de uma vez. */}
        <div
          id={painelId}
          aria-hidden={!open}
          className={cn(
            "transition-[max-height] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
            open ? "max-h-[52vh] overflow-y-auto" : "max-h-0 overflow-hidden",
          )}
        >
          <div className="px-5 pt-4">{children}</div>
        </div>

        {/* A linha do total é o próprio botão de abrir. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={painelId}
          className="flex w-full items-center justify-between gap-3 px-5 pb-3 pt-3.5 text-left"
        >
          <span className="flex min-w-0 flex-col">
            <span className="text-title-md tabular-nums text-ink">{formatBRL(total)}</span>
            <span className="truncate text-caption-sm text-muted">{subtitle}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-caption-sm font-semibold text-mp-primary">
            {open ? "ocultar" : "detalhes"}
            <CaretDown
              className={cn(
                "h-4 w-4 transition-transform duration-200 motion-reduce:transition-none",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </span>
        </button>

        {/* `safe-bottom` mantém o CTA acima do indicador de home do aparelho. */}
        {cta && <div className="px-5 pb-[max(1rem,var(--safe-bottom))]">{cta}</div>}
      </div>
    </>
  );
}
