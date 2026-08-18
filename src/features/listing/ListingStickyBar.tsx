import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";
import type { ReservationSummary } from "./reservation.logic";

type Props = {
  /** Resumo vivo do ReservationCard (mobile). Null enquanto não reportou. */
  summary: ReservationSummary | null;
  /** Preço de balcão da unidade, usado como fallback "A partir de" sem datas. */
  basePrice: number;
  /** Leva o usuário ao card de reserva (escolher datas / conferir). */
  onReserve: () => void;
};

/**
 * Barra fixa de reserva do mobile na página do estacionamento (referência Airbnb).
 * Com datas escolhidas mostra o TOTAL da reserva (espelha o card); sem datas cai
 * no "A partir de" (preço de balcão) ou num convite pra escolher as datas.
 *
 * Publica a própria altura em `--sticky-bar-space` (ver `index.css`) pra quem
 * mais está fixo no rodapé, hoje a `WhatsappBubble`, saber que precisa subir.
 * `desktop:hidden` zera a altura em tela larga sem nenhuma lógica de breakpoint
 * aqui: o elemento vira `display: none`, o ResizeObserver mede zero, e quem lê
 * a variável desce sozinho.
 */
export function ListingStickyBar({ summary, basePrice, onReserve }: Props) {
  const canReserve = summary?.canReserve ?? false;
  const barraRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const barra = barraRef.current;
    if (!barra) return;

    const publicarAltura = () => {
      document.documentElement.style.setProperty("--sticky-bar-space", `${barra.offsetHeight}px`);
    };

    const observer = new ResizeObserver(publicarAltura);
    observer.observe(barra);

    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty("--sticky-bar-space", "0px");
    };
  }, []);

  return (
    <div
      ref={barraRef}
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t border-hairline bg-canvas/95 px-4 pt-3 pb-[max(0.75rem,var(--safe-bottom))] backdrop-blur-sm desktop:hidden"
    >
      <div className="min-w-0">
        {canReserve && summary ? (
          <>
            <p className="text-caption text-ink">Total</p>
            <p className="text-display-sm font-bold text-ink tabular-nums">
              {formatBRL(summary.total)}
            </p>
            {summary.cancellationLine && (
              <p className="line-clamp-1 text-[12px] leading-tight text-muted">
                {summary.cancellationLine}
              </p>
            )}
          </>
        ) : basePrice > 0 ? (
          <>
            <p className="text-caption text-ink">A partir de</p>
            <p className="text-display-sm font-bold text-ink tabular-nums">
              {formatBRL(basePrice)}
            </p>
          </>
        ) : (
          <p className="text-body-sm font-semibold text-ink">Escolha as datas</p>
        )}
      </div>
      <Button className="shrink-0" onClick={onReserve}>
        Reservar
      </Button>
    </div>
  );
}
