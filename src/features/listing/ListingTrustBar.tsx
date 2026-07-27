import { ShieldCheck, CalendarX, Tag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/**
 * Barra de confiança nas páginas de estacionamento, logo abaixo do header. Mantém os
 * 3 principais diferenciais da Movepark à vista (por que reservar aqui e não na
 * concorrência). Rola junto com o conteúdo (não é mais sticky): a versão fixa roubava
 * espaço vertical e incomodava no scroll.
 *
 * No mobile os itens passam sozinhos num carrossel (marquee), pra mostrar os 3 sem
 * empilhar e sem gastar tela. Sob `prefers-reduced-motion` o movimento para: cai numa
 * linha estática rolável, com os 3 itens acessíveis.
 */
const DIFERENCIAIS: { icon: LucideIcon; title: string; sub: string }[] = [
  { icon: ShieldCheck, title: "Vaga garantida", sub: "ou cobrimos a diferença" },
  { icon: CalendarX, title: "Cancelamento grátis", sub: "até 24h antes" },
  { icon: Tag, title: "Preço travado", sub: "sem surpresa no balcão" },
];

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

// Fade nas laterais do marquee (o Tailwind não traz utilitário de máscara).
const FADE = "linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)";

export function ListingTrustBar() {
  const reduced = usePrefersReducedMotion();

  return (
    <div className="border-b border-hairline bg-canvas">
      {/* Mobile: carrossel automático (marquee), no padrão do PartnerLogos — dois
          blocos idênticos + trilho até -50% pra loop sem emenda. Sob reduced-motion
          o hook troca por uma linha estática rolável (todos os 3 alcançáveis). */}
      <div className="tablet:hidden">
        {reduced ? (
          <div className="flex items-center gap-8 overflow-x-auto px-4 py-2.5 scrollbar-none">
            {DIFERENCIAIS.map((d) => (
              <TrustItem key={d.title} d={d} />
            ))}
          </div>
        ) : (
          <>
            <style>{`
              @keyframes mp-trust-marquee {
                from { transform: translateX(0); }
                to   { transform: translateX(-50%); }
              }
              .mp-trust-track { animation: mp-trust-marquee 16s linear infinite; }
              @media (prefers-reduced-motion: reduce) {
                .mp-trust-track { animation: none; }
              }
            `}</style>
            <div
              className="relative overflow-hidden py-2.5"
              style={{ maskImage: FADE, WebkitMaskImage: FADE }}
            >
              <div className="mp-trust-track flex w-max">
                {[0, 1].map((b) => (
                  <div
                    key={b}
                    aria-hidden={b === 1}
                    className="flex shrink-0 items-center gap-8 pr-8"
                  >
                    {DIFERENCIAIS.map((d) => (
                      <TrustItem key={d.title} d={d} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Desktop: linha centralizada que rola junto com o conteúdo (sem sticky). */}
      <div className="mx-auto hidden max-w-[1280px] items-center justify-center gap-12 px-8 py-2.5 tablet:flex">
        {DIFERENCIAIS.map((d) => (
          <TrustItem key={d.title} d={d} showSub />
        ))}
      </div>
    </div>
  );
}
