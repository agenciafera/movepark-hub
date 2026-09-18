import { cn } from "@/lib/utils";
import type { OfertaPublica } from "./api";
import {
  ofertaAmountLabel,
  ofertaCapLabel,
  ofertaCondicoes,
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
 * O deslocamento dos furos vai inline pelo mesmo motivo do `writing-mode`: medido, as classes
 * `-left-2.5`/`-right-2.5` não geravam CSS (computed ficava `left: 0`) e os dois furos empilhavam
 * no canto esquerdo.
 *
 * O canhoto da direita carrega o código, sempre na vertical: "BEMVINDO30" na horizontal não cabe
 * e sai cortado. Nesta tela não existe botão "Usar" porque não há pedido para aplicar: a vitrine
 * mostra o que a campanha é, e aplicar acontece no checkout.
 *
 * `terms` NÃO é renderizado aqui de propósito. As condições saem dos campos (`ofertaCondicoes`),
 * e o texto livre do Manager repete as mesmas frases: mostrar os dois deixava cada cartão dizendo
 * "Vale na primeira reserva" duas vezes. O `terms` continua servindo à carteira, onde o cliente
 * decide usar o cupom.
 */
export function OfertaTicket({ oferta }: { oferta: OfertaPublica }) {
  const teto = ofertaCapLabel(oferta);
  const condicoes = ofertaCondicoes(oferta);
  const selo = ofertaSelo(oferta.audience);

  return (
    <article className="relative flex rounded-md border border-hairline bg-canvas">
      {/* Os furos do ticket. `aria-hidden` porque são desenho, não conteúdo. */}
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
              selo.tom === "destaque"
                ? "bg-primary text-on-primary"
                : "bg-badge-confirmed-bg text-badge-confirmed-fg",
            )}
          >
            {selo.texto}
          </span>
        ) : null}

        <p className="text-display-sm text-success">
          {ofertaAmountLabel(oferta)}
          {teto ? <span className="text-body-sm">, {teto}</span> : null}
        </p>

        {oferta.title ? <p className="text-title-sm text-ink">{oferta.title}</p> : null}

        {condicoes.length > 0 ? (
          <ul className="mt-0.5 space-y-0.5">
            {condicoes.map((c) => (
              <li key={c} className="text-caption-sm text-muted">
                {c}
              </li>
            ))}
          </ul>
        ) : null}

      </div>

      {/* Canhoto: o código, separado por picote. `border-dashed` é o picote. */}
      <div className="flex w-14 shrink-0 items-center justify-center rounded-r-[13px] border-l border-dashed border-hairline bg-surface-pale">
        {/* `writing-mode` vai inline porque a classe arbitrária do Tailwind não gera a regra:
            medido no navegador, o computed ficava `horizontal-tb` e o código transbordava
            (82px de texto num canhoto de 56px). */}
        <span
          className="font-mono text-caption-sm tracking-wide text-ink"
          style={{ writingMode: "vertical-rl" }}
        >
          {oferta.code}
        </span>
      </div>
    </article>
  );
}
