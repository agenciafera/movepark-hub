import { LockSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OfertaPublica } from "./api";
import {
  ofertaAmountLabel,
  ofertaCapLabel,
  ofertaCondicoes,
  ofertaEstagio,
  ofertaSelo,
} from "./publicOffers.logic";

/**
 * Cartão de campanha em formato de ticket, o mesmo desenho da referência (99/iFood).
 *
 * O recorte lateral é o que faz o olho ler "cupom" antes de ler a palavra. São dois círculos
 * pintados com a COR DO FUNDO da página, então eles só funcionam sobre `bg-surface-soft`: a página
 * fixa esse fundo, e mudar um sem o outro faz os furos aparecerem como bolinhas.
 *
 * O cartão NÃO pode ter `overflow-hidden`: medido no navegador, ele cortava os dois furos, que
 * ficam propositalmente para fora da borda. Por isso o canhoto arredonda os próprios cantos.
 *
 * O deslocamento dos furos e o `writing-mode` do código vão inline porque as classes equivalentes
 * do Tailwind não geram regra neste projeto (medido: `left` ficava 0 e o writing-mode ficava
 * `horizontal-tb`, com o código transbordando 82px num canhoto de 56px).
 *
 * `terms` não é renderizado: as condições saem dos campos, e o texto livre repetia as mesmas
 * frases, deixando cada cartão dizendo "Vale na primeira reserva" duas vezes.
 */
export function OfertaTicket({ oferta }: { oferta: OfertaPublica }) {
  const teto = ofertaCapLabel(oferta);
  const condicoes = ofertaCondicoes(oferta);
  const selo = ofertaSelo(oferta.audience);
  const estagio = ofertaEstagio(oferta.audience);
  const bloqueado = estagio.quando === "depois";

  return (
    <article
      className={cn(
        "relative flex rounded-md border bg-canvas",
        bloqueado ? "border-hairline-soft" : "border-hairline",
      )}
    >
      <span
        aria-hidden
        className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-surface-soft"
        style={{ left: -10 }}
      />
      <span
        aria-hidden
        className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-surface-soft"
        style={{ right: -10 }}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-5">
        {selo ? (
          <span
            className={cn(
              "w-fit rounded-full px-2 py-0.5 text-badge",
              bloqueado
                ? "bg-surface-strong text-muted"
                : selo.tom === "destaque"
                  ? "bg-primary text-on-primary"
                  : "bg-badge-confirmed-bg text-badge-confirmed-fg",
            )}
          >
            {selo.texto}
          </span>
        ) : null}

        <p className={cn("text-display-sm", bloqueado ? "text-muted" : "text-success")}>
          {ofertaAmountLabel(oferta)}
          {teto ? <span className="text-body-sm">, {teto}</span> : null}
        </p>

        {oferta.title ? (
          <p className={cn("text-title-sm", bloqueado ? "text-muted" : "text-ink")}>
            {oferta.title}
          </p>
        ) : null}

        {condicoes.length > 0 ? (
          <ul className="mt-0.5 space-y-0.5">
            {condicoes.map((c) => (
              <li key={c} className="text-caption-sm text-muted">
                {c}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-3">
          {/* O que destrava o cupom fica ao lado do botão, e não escondido no rodapé: é a
              informação que transforma um cartão apagado em motivo para voltar. */}
          {bloqueado ? (
            <span className="flex min-w-0 items-center gap-1.5 text-caption-sm text-warning">
              <LockSimple className="h-4 w-4 shrink-0" aria-hidden />
              {estagio.destrava}
            </span>
          ) : (
            <span className="text-caption-sm text-muted">Entra no pagamento da reserva</span>
          )}

          {/* O CTA fica visível mesmo desabilitado, de propósito: ele mostra que o cupom é uma
              coisa que se usa, não um aviso. Aplicar de verdade acontece no checkout, onde existe
              um pedido para descontar. */}
          <Button size="sm" disabled className="shrink-0">
            Usar
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "flex w-14 shrink-0 items-center justify-center rounded-r-[13px] border-l border-dashed",
          bloqueado
            ? "border-hairline-soft bg-surface-soft"
            : "border-hairline bg-surface-pale",
        )}
      >
        <span
          className={cn(
            "font-mono text-caption-sm tracking-wide",
            bloqueado ? "text-muted" : "text-ink",
          )}
          style={{ writingMode: "vertical-rl" }}
        >
          {oferta.code}
        </span>
      </div>
    </article>
  );
}
