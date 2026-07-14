import { Link } from "react-router-dom";
import { Plane, ArrowRight } from "lucide-react";
import { useRef, useEffect } from "react";
import { gsap } from "@/lib/gsap";

const CARD_W  = 400;   // px — largura do card
const GAP     = 20;    // px — espaço entre cards
const ITEM_W  = CARD_W + GAP;
const SET_W   = 10 * ITEM_W; // largura de um set completo = 4200px

// Alturas e deslocamentos verticais — criam o layout "desalinhado"
const HEIGHTS = [300, 400, 340, 430, 320, 380, 410, 330, 390, 350];
const OFFSETS = [  0,  70,  28,  90,  50,  15,  75,  40,  82,  55];

// Altura do container = max(height + offset) + margem de scaleY
// max: 430 + 90 = 520 → +80px para o hover scale crescer para baixo → 600px
const CONTAINER_H = 600;

const DURATION = 55; // segundos para uma volta completa

const DEST_COUNTS: Record<string, number> = {
  GRU: 12, CGH: 5, CNF: 3, GIG: 4, SDU: 3,
  CWB: 4,  VCP: 6, POA: 3, BSB: 4, TIE: 2,
};

const items: { label: string; city: string; state: string; dest: string; img: string }[] = [
  { label: "Aeroporto de Guarulhos",             city: "Guarulhos",      state: "SP", dest: "GRU", img: "/airports/GRU.webp"   },
  { label: "Aeroporto de Congonhas",             city: "São Paulo",      state: "SP", dest: "CGH", img: "/airports/CGH.webp"   },
  { label: "Aeroporto Internacional de Confins", city: "Belo Horizonte", state: "MG", dest: "CNF", img: "/airports/CNF.webp"   },
  { label: "Aeroporto do Galeão",                city: "Rio de Janeiro", state: "RJ", dest: "GIG", img: "/airports/GIG.webp"   },
  { label: "Aeroporto Santos Dumont",            city: "Rio de Janeiro", state: "RJ", dest: "SDU", img: "/airports/SDU.webp"   },
  { label: "Aeroporto Afonso Pena",              city: "Curitiba",       state: "PR", dest: "CWB", img: "/airports/CWB.webp"   },
  { label: "Aeroporto de Viracopos",             city: "Campinas",       state: "SP", dest: "VCP", img: "/airports/VCP.webp"   },
  { label: "Aeroporto Salgado Filho",            city: "Porto Alegre",   state: "RS", dest: "POA", img: "/airports/POA.webp"   },
  { label: "Aeroporto de Brasília",              city: "Brasília",       state: "DF", dest: "BSB", img: "/airports/BSB.webp"   },
  { label: "Terminal Tietê",                     city: "São Paulo",      state: "SP", dest: "TIE", img: "/airports/tiete.webp" },
];

// Duplica os items para loop contínuo
const loopItems = [...items, ...items];

function DestinationCard({
  label, city, state, dest, img, height,
}: (typeof items)[number] & { height: number }) {
  const count = DEST_COUNTS[dest] ?? 2;
  return (
    <Link
      to={`/search?dest=${dest}`}
      className="group relative block overflow-hidden rounded-2xl bg-surface-strong
                 transition-transform duration-500 ease-out hover:scale-y-[1.18]"
      style={{ width: CARD_W, height, transformOrigin: "top center" }}
    >
      <img
        src={img}
        alt={label}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
        decoding="async"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" aria-hidden />

      <div className="absolute bottom-0 left-0 right-0 p-5">
        <p className="text-[15px] font-semibold leading-snug text-white drop-shadow-sm">
          {label}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-white/70">
          <Plane className="h-3 w-3 shrink-0" aria-hidden />
          {city} · {state}
        </p>
        <div className="mt-3 overflow-hidden">
          <span
            className="inline-block translate-y-5 opacity-0 group-hover:translate-y-0 group-hover:opacity-100
                       transition-all duration-300 delay-100
                       rounded-full bg-white/95 px-3 py-1 text-[12px] font-semibold text-ink"
          >
            {count} estacionamentos
          </span>
        </div>
      </div>
    </Link>
  );
}

export function DestinationsGallery() {
  const sectionRef  = useRef<HTMLElement>(null);
  const headerRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo("[data-reveal='dg-header']", { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.6, ease: "power2.out", stagger: 0.08,
          scrollTrigger: { trigger: headerRef.current, start: "top 88%", once: true } });
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="py-16 desktop:py-24">
      {/* Keyframes do marquee e pausa no hover */}
      <style>{`
        @keyframes dg-marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-${SET_W}px); }
        }
        .dg-track {
          animation: dg-marquee ${DURATION}s linear infinite;
          will-change: transform;
        }
        .dg-track:hover {
          animation-play-state: paused;
        }
      `}</style>

      {/* Cabeçalho */}
      <div ref={headerRef} className="mx-auto mb-10 max-w-[1280px] px-6 text-center desktop:px-8">
        <p data-reveal="dg-header" className="mb-2 text-caption-sm font-bold uppercase tracking-widest text-mp-violet">
          Destinos mais procurados
        </p>
        <h2
          data-reveal="dg-header"
          className="mb-3 text-[36px] font-bold leading-[1.1] text-ink tablet:text-display-2xl"
          style={{ textWrap: "balance" } as React.CSSProperties}
        >
          Estacione nos principais
          <br className="hidden tablet:block" /> destinos do Brasil
        </h2>
        <p data-reveal="dg-header" className="mx-auto mb-6 max-w-xl text-body-md text-muted">
          Conheça os principais aeroportos e terminais do Brasil com estacionamentos verificados.
        </p>
        <div data-reveal="dg-header">
          <Link
            to="/search"
            className="inline-flex items-center gap-2 rounded-full bg-mp-primary px-6 py-3 text-button-sm font-semibold text-white transition-colors hover:bg-mp-primary-active"
          >
            Ver todos os destinos <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Marquee infinito */}
      <div className="overflow-hidden" style={{ height: CONTAINER_H }}>
        <div
          className="dg-track flex"
          style={{ width: SET_W * 2, gap: GAP }}
        >
          {loopItems.map((item, i) => {
            const idx = i % items.length;
            return (
              <div
                key={`${item.dest}-${i}`}
                className="shrink-0"
                style={{ marginTop: OFFSETS[idx] }}
              >
                <DestinationCard {...item} height={HEIGHTS[idx]} />
              </div>
            );
          })}
        </div>
      </div>

    </section>
  );
}
