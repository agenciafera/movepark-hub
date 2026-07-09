import * as React from "react";
import { ShieldCheck, CalendarX, Tag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Barra fixa de confiança nas páginas de estacionamento — logo abaixo do header.
 * Mantém os 3 principais diferenciais da Movepark sempre à vista (por que reservar
 * aqui e não na concorrência). Sticky em `top-20` (altura do ConsumerTopbar).
 * Ao rolar a página, o bloco recua um pouco (opacidade + blur) e volta ao normal
 * quando o scroll retorna ao topo.
 */
const DIFERENCIAIS: { icon: LucideIcon; title: string; sub: string }[] = [
  { icon: ShieldCheck, title: "Vaga garantida", sub: "ou cobrimos a diferença" },
  { icon: CalendarX, title: "Cancelamento grátis", sub: "até 24h antes" },
  { icon: Tag, title: "Preço travado", sub: "sem surpresa no balcão" },
];

export function ListingTrustBar() {
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="sticky top-20 z-30 border-b border-hairline bg-canvas/95 backdrop-blur">
      <div
        className={cn(
          "mx-auto flex max-w-[1280px] items-center gap-5 overflow-x-auto px-4 py-2.5 scrollbar-none transition-all duration-300 ease-standard desktop:justify-center desktop:gap-12 desktop:px-8",
          scrolled ? "opacity-60 blur-[1.5px]" : "opacity-100 blur-0",
        )}
      >
        {DIFERENCIAIS.map((d) => (
          <div key={d.title} className="flex shrink-0 items-center gap-2.5">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
              <d.icon className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <p className="text-caption font-medium text-ink">{d.title}</p>
              <p className="hidden text-caption-sm text-muted tablet:block">{d.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
