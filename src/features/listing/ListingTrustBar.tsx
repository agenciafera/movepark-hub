import * as React from "react";
import { CalendarX, ShieldCheck, Tag } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";

/** No Phosphor, `Icon` é valor; o tipo do componente é este. */
type Icon = ComponentType<IconProps>;
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/**
 * Barra de confiança nas páginas de estacionamento, logo abaixo do header. Mantém os
 * 3 principais diferenciais da Movepark à vista (por que reservar aqui e não na
 * concorrência). Rola junto com o conteúdo (não é mais sticky): a versão fixa roubava
 * espaço vertical e incomodava no scroll.
 *
 * No mobile é um carrossel: mostra um diferencial por vez, avança sozinho de um em um
 * e o usuário pode arrastar (swipe) pro lado. Sob `prefers-reduced-motion` o avanço
 * automático para; o swipe continua funcionando.
 */
const DIFERENCIAIS: { icon: Icon; title: string; sub: string }[] = [
  { icon: ShieldCheck, title: "Vaga garantida", sub: "ou cobrimos a diferença" },
  { icon: CalendarX, title: "Cancelamento grátis", sub: "até 24h antes" },
  { icon: Tag, title: "Preço travado", sub: "sem surpresa no balcão" },
];

const AUTO_ADVANCE_MS = 3500;

function TrustItem({ d, showSub = false }: { d: (typeof DIFERENCIAIS)[number]; showSub?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
        <d.icon className="h-4 w-4" />
      </span>
      <div className="leading-tight">
        <p className="whitespace-nowrap text-caption font-medium text-ink">{d.title}</p>
        {showSub && <p className="whitespace-nowrap text-caption-sm text-muted">{d.sub}</p>}
      </div>
    </div>
  );
}

/**
 * Carrossel do mobile. Scroll-snap horizontal (um item por "slide"), então o swipe é
 * nativo. O auto-avanço rola pro próximo slide a cada alguns segundos, em loop, e
 * pausa enquanto o dedo está na tela. Sob reduced-motion o timer nem monta.
 */
function TrustCarousel() {
  const reduced = usePrefersReducedMotion();
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [index, setIndex] = React.useState(0);
  // Pausa o avanço automático enquanto o usuário está arrastando.
  const pausedRef = React.useRef(false);

  const goTo = React.useCallback((i: number, smooth: boolean) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
  }, []);

  React.useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      if (pausedRef.current) return;
      const el = trackRef.current;
      if (!el) return;
      const count = DIFERENCIAIS.length;
      // Lê a posição real (fonte da verdade) pra retomar de onde o usuário parou.
      const cur = el.clientWidth ? Math.round(el.scrollLeft / el.clientWidth) : 0;
      goTo((cur + 1) % count, true);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [reduced, goTo]);

  const onScroll = () => {
    const el = trackRef.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setIndex((prev) => (prev === i ? prev : i));
  };

  return (
    <div className="tablet:hidden">
      <div
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={() => (pausedRef.current = true)}
        onPointerUp={() => (pausedRef.current = false)}
        onPointerCancel={() => (pausedRef.current = false)}
        onPointerLeave={() => (pausedRef.current = false)}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scrollbar-none"
      >
        {DIFERENCIAIS.map((d) => (
          <div
            key={d.title}
            className="flex w-full shrink-0 snap-center items-center justify-center px-4 py-2.5"
          >
            <TrustItem d={d} showSub />
          </div>
        ))}
      </div>

      {/* Indicador de posição (também navega ao toque) */}
      <div className="flex justify-center gap-1.5 pb-2">
        {DIFERENCIAIS.map((d, i) => (
          <button
            key={d.title}
            type="button"
            aria-label={`Ir para: ${d.title}`}
            aria-current={i === index}
            onClick={() => goTo(i, !reduced)}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === index ? "w-4 bg-mp-indigo" : "w-1.5 bg-hairline",
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function ListingTrustBar() {
  return (
    <div className="border-b border-hairline bg-canvas">
      <TrustCarousel />

      {/* Desktop: linha centralizada que rola junto com o conteúdo (sem sticky). */}
      <div className="mx-auto hidden max-w-[1280px] items-center justify-center gap-12 px-8 py-2.5 tablet:flex">
        {DIFERENCIAIS.map((d) => (
          <TrustItem key={d.title} d={d} showSub />
        ))}
      </div>
    </div>
  );
}
