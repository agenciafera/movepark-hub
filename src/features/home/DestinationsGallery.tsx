import { Link } from "react-router-dom";
import { Airplane, ArrowRight } from "@phosphor-icons/react";
import { useRef, useEffect } from "react";
import { gsap } from "@/lib/gsap";
import { Button } from "@/components/ui/button";
import { proximaPosicao } from "./carousel.logic";

const CARD_W = 400; // px, teto da largura do card (no celular ele encolhe)
const GAP = 20; // px, espaço entre cards

// Alturas e deslocamentos verticais, que criam o layout desalinhado
const HEIGHTS = [300, 400, 340, 430, 320, 380, 410, 330, 390, 350];
const OFFSETS = [0, 70, 28, 90, 50, 15, 75, 40, 82, 55];

// Altura do container = max(height + offset) + margem de scaleY
// max: 430 + 90 = 520 → +80px para o hover scale crescer para baixo → 600px
const CONTAINER_H = 600;

/**
 * Velocidade do avanço automático, em pixels por segundo.
 *
 * Vem de px/s e não da duração da volta porque agora o usuário também arrasta: a
 * posição muda por fora da animação, e uma duração fixa exigiria recalcular o
 * ponto de partida a cada toque. Em px/s o avanço é sempre o mesmo, comece de
 * onde começar. Os 4200px do conjunto em 55s davam ~76px/s.
 */
const VELOCIDADE = 76;

const DEST_COUNTS: Record<string, number> = {
  GRU: 12,
  CGH: 5,
  CNF: 3,
  GIG: 4,
  SDU: 3,
  CWB: 4,
  VCP: 6,
  POA: 3,
  BSB: 4,
  TIE: 2,
};

const items: { label: string; city: string; state: string; dest: string; img: string }[] = [
  {
    label: "Aeroporto de Guarulhos",
    city: "Guarulhos",
    state: "SP",
    dest: "GRU",
    img: "/airports/GRU.webp",
  },
  {
    label: "Aeroporto de Congonhas",
    city: "São Paulo",
    state: "SP",
    dest: "CGH",
    img: "/airports/CGH.webp",
  },
  {
    label: "Aeroporto Internacional de Confins",
    city: "Belo Horizonte",
    state: "MG",
    dest: "CNF",
    img: "/airports/CNF.webp",
  },
  {
    label: "Aeroporto do Galeão",
    city: "Rio de Janeiro",
    state: "RJ",
    dest: "GIG",
    img: "/airports/GIG.webp",
  },
  {
    label: "Aeroporto Santos Dumont",
    city: "Rio de Janeiro",
    state: "RJ",
    dest: "SDU",
    img: "/airports/SDU.webp",
  },
  {
    label: "Aeroporto Afonso Pena",
    city: "Curitiba",
    state: "PR",
    dest: "CWB",
    img: "/airports/CWB.webp",
  },
  {
    label: "Aeroporto de Viracopos",
    city: "Campinas",
    state: "SP",
    dest: "VCP",
    img: "/airports/VCP.webp",
  },
  {
    label: "Aeroporto Salgado Filho",
    city: "Porto Alegre",
    state: "RS",
    dest: "POA",
    img: "/airports/POA.webp",
  },
  {
    label: "Aeroporto de Brasília",
    city: "Brasília",
    state: "DF",
    dest: "BSB",
    img: "/airports/BSB.webp",
  },
  {
    label: "Terminal Tietê",
    city: "São Paulo",
    state: "SP",
    dest: "TIE",
    img: "/airports/tiete.webp",
  },
];

// Duplica os items para loop contínuo
const loopItems = [...items, ...items];

function DestinationCard({
  label,
  city,
  state,
  dest,
  img,
  height,
}: (typeof items)[number] & { height: number }) {
  const count = DEST_COUNTS[dest] ?? 2;
  return (
    <Link
      to={`/search?dest=${dest}`}
      className="group relative block overflow-hidden rounded-2xl bg-surface-strong transition-transform duration-500 ease-out hover:scale-y-[1.18]"
      /* `min()` porque 400px é mais largo que um celular de 375: o card ficava
         sempre cortado e nunca dava para ver um inteiro. Os 78vw deixam a borda
         do próximo aparecendo, que é o convite para arrastar. */
      style={{ width: `min(${CARD_W}px, 78vw)`, height, transformOrigin: "top center" }}
    >
      <img
        src={img}
        alt={label}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
        decoding="async"
      />
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
        aria-hidden
      />

      <div className="absolute bottom-0 left-0 right-0 p-5">
        <p className="text-[15px] font-semibold leading-snug text-white drop-shadow-sm">{label}</p>
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-white/70">
          <Airplane className="h-3 w-3 shrink-0" aria-hidden />
          {city} · {state}
        </p>
        <div className="mt-3 overflow-hidden">
          <span className="inline-block translate-y-5 rounded-full bg-white/95 px-3 py-1 text-[12px] font-semibold text-ink opacity-0 transition-all delay-100 duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            {count} estacionamentos
          </span>
        </div>
      </div>
    </Link>
  );
}

export function DestinationsGallery() {
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const trilhoRef = useRef<HTMLDivElement>(null);
  /* Pausa o avanço enquanto a mão está no carrossel, e por um tempo depois. */
  const pausadoAte = useRef(0);

  /*
    A largura de um conjunto é medida no DOM, não calculada de constante: o card
    encolhe com a tela, e um número cravado erraria o ponto da volta em todo
    celular. `scrollWidth / 2` é exato porque a trilha traz o conjunto duas vezes.
  */
  const larguraDoSet = () => (trilhoRef.current?.scrollWidth ?? 0) / 2;

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-reveal='dg-header']",
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: "power2.out",
          stagger: 0.08,
          scrollTrigger: { trigger: headerRef.current, start: "top 88%", once: true },
        },
      );
    }, el);
    return () => ctx.revert();
  }, []);

  /*
    O avanço automático virou rolagem de verdade, não `transform`.

    Com `translateX` o usuário não tem como arrastar: o dedo rola a página, não a
    trilha. Movendo o `scrollLeft` de um container rolável, o arrasto no celular
    passa a funcionar de graça, com a inércia do próprio sistema, e o automático
    continua por cima.
  */
  useEffect(() => {
    const trilho = trilhoRef.current;
    if (!trilho) return;
    // Quem pediu menos movimento fica só com o arrasto.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let anterior = 0;

    const passo = (agora: number) => {
      const decorrido = anterior ? (agora - anterior) / 1000 : 0;
      anterior = agora;
      if (agora >= pausadoAte.current && decorrido > 0 && decorrido < 0.5) {
        trilho.scrollLeft = proximaPosicao(
          trilho.scrollLeft,
          VELOCIDADE * decorrido,
          larguraDoSet(),
        );
      }
      frame = requestAnimationFrame(passo);
    };
    frame = requestAnimationFrame(passo);

    /* Aba em segundo plano não recebe rAF; ao voltar, o primeiro delta seria
       gigante. Zerar o relógio evita o salto. */
    const aoVoltar = () => {
      anterior = 0;
    };
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, []);

  /* Segura o automático enquanto interage, e devolve 2s depois do último toque. */
  const segurar = () => {
    pausadoAte.current = performance.now() + 2000;
  };

  /*
    O `scrollLeft` também precisa dar a volta quando quem move é o usuário: sem
    isso o arrasto bate no fim da trilha e o carrossel trava até o automático
    reassumir.
  */
  const aoRolar = () => {
    const trilho = trilhoRef.current;
    if (!trilho) return;
    const set = larguraDoSet();
    if (set <= 0) return;
    if (trilho.scrollLeft >= set) trilho.scrollLeft -= set;
    else if (trilho.scrollLeft <= 0) trilho.scrollLeft += set;
  };

  return (
    <section ref={sectionRef} className="py-16 desktop:py-24">
      {/* Cabeçalho */}
      <div ref={headerRef} className="mx-auto mb-10 max-w-[1280px] px-6 text-center desktop:px-8">
        <p
          data-reveal="dg-header"
          className="mb-2 text-badge uppercase tracking-[0.4px] text-mp-indigo"
        >
          Destinos mais procurados
        </p>
        <h2
          data-reveal="dg-header"
          className="mb-3 text-display-2xl text-ink"
          style={{ textWrap: "balance" } as React.CSSProperties}
        >
          Estacione nos principais
          <br className="hidden tablet:block" /> destinos do Brasil
        </h2>
        <p data-reveal="dg-header" className="mx-auto mb-6 max-w-xl text-body-md text-muted">
          Conheça os principais aeroportos e terminais do Brasil com estacionamentos verificados.
        </p>
        <div data-reveal="dg-header">
          <Button asChild>
            <Link to="/search">
              Ver todos os destinos <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {/*
        Carrossel: avança sozinho e aceita arrasto.

        `overflow-x-auto` é o que dá o arrasto e a inércia do sistema no celular
        sem uma linha de JS. `scrollbar-none` esconde a barra, que num carrossel
        automático só polui. `touch-pan-x` garante que o gesto horizontal role a
        trilha e o vertical continue rolando a página.
      */}
      <div
        ref={trilhoRef}
        onScroll={aoRolar}
        onPointerDown={segurar}
        onPointerMove={segurar}
        onTouchStart={segurar}
        onTouchMove={segurar}
        onMouseEnter={segurar}
        onMouseMove={segurar}
        className="scrollbar-none touch-pan-x overflow-x-auto overscroll-x-contain"
        style={{ height: CONTAINER_H }}
        aria-label="Destinos mais procurados"
        role="group"
      >
        <div className="flex w-max" style={{ gap: GAP }}>
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
