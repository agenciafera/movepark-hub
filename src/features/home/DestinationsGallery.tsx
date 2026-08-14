import { Link } from "react-router-dom";
import { Airplane, ArrowRight, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useRef, useEffect, useCallback, useState } from "react";
import { gsap } from "@/lib/gsap";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { proximaPosicao, suavizar } from "./carousel.logic";

const CARD_W = 400; // px, teto da largura do card (no celular ele encolhe)
const CARD_H = 420; // px, altura única de todos os cards
const GAP = 20; // px, espaço entre cards

/** Intervalo entre um passo e o próximo, em ms. */
const INTERVALO = 4000;

/** Duração de um passo, em ms. */
const DURACAO = 600;

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

function DestinationCard({ label, city, state, dest, img }: (typeof items)[number]) {
  const count = DEST_COUNTS[dest] ?? 2;
  return (
    <Link
      to={`/search?dest=${dest}`}
      /* O realce do mouse é só a sombra e o zoom da imagem. A esticada vertical
         que existia aqui deformava o card, e num carrossel que anda sozinho o
         cursor esbarra em card atrás de card. */
      className="group relative block overflow-hidden rounded-2xl bg-surface-strong transition-shadow hover:shadow-tier"
      /* `min()` porque 400px é mais largo que um celular de 375: o card ficava
         sempre cortado e nunca dava para ver um inteiro. Os 78vw deixam a borda
         do próximo aparecendo, que é o convite para arrastar. */
      style={{ width: `min(${CARD_W}px, 78vw)`, height: CARD_H }}
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
        {/* Sempre visível. Escondido atrás do hover, o dado não existia no
            celular, que é de onde vem a maior parte do acesso. */}
        <span className="mt-3 inline-block rounded-full bg-white/95 px-3 py-1 text-[12px] font-semibold text-ink">
          {count} {count === 1 ? "estacionamento" : "estacionamentos"}
        </span>
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
  /* Passo em andamento. O tween mexe no `scrollLeft`, o que dispara `onScroll`:
     sem essa trava o tratador de arrasto daria a volta no meio da animação. */
  const animando = useRef(false);
  const tweenRef = useRef(0);
  /* Qual destino está na borda, para os pontos indicarem a posição. */
  const [indice, setIndice] = useState(0);

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
    O passo sai do card renderizado, não da constante: `min(400px, 78vw)` encolhe
    com a tela, e um número cravado erraria o alinhamento no celular.
  */
  const passoDoCard = useCallback(() => {
    const card = trilhoRef.current?.querySelector<HTMLElement>("[data-card]");
    return card ? card.getBoundingClientRect().width + GAP : 0;
  }, []);

  /* Qual card está na borda agora, para acender o ponto certo. O resto da divisão
     pelo número de destinos junta as duas metades da trilha no mesmo ponto. */
  const sincronizarIndice = useCallback(() => {
    const trilho = trilhoRef.current;
    const passo = passoDoCard();
    if (!trilho || passo <= 0) return;
    setIndice(Math.round(trilho.scrollLeft / passo) % items.length);
  }, [passoDoCard]);

  /*
    Um card por vez, e não um deslize contínuo.

    O deslize de marquee nunca parava num card inteiro: o olho pegava sempre uma
    imagem no meio do corte, e o carrossel lia como enfeite em vez de lista de
    destino. Andar em passo cheio deixa um card sempre alinhado na borda.

    Continua sendo `scrollLeft` de um container rolável, não `transform`, porque é
    o que dá o arrasto e a inércia do sistema no celular sem uma linha de JS.

    `direcao` é 1 para frente e -1 para trás. O relógio só anda para frente; as
    setas usam os dois lados.
  */
  const andar = useCallback(
    (direcao: number) => {
      const trilho = trilhoRef.current;
      if (!trilho) return;
      const passo = passoDoCard() * direcao;
      const set = larguraDoSet();
      if (passo === 0 || set <= 0) return;

      /* Cancelar antes de agendar: sem isso, dois cliques seguidos deixam dois
         tweens disputando o mesmo `scrollLeft` e o carrossel treme. */
      cancelAnimationFrame(tweenRef.current);
      const de = trilho.scrollLeft;
      const inicio = performance.now();
      animando.current = true;

      const quadro = (agora: number) => {
        const t = (agora - inicio) / DURACAO;
        if (t >= 1) {
          /* A normalização só acontece no fim do passo. Feita durante, o corte
             para o conjunto gêmeo cairia no meio da animação e apareceria. */
          trilho.scrollLeft = proximaPosicao(de, passo, set);
          animando.current = false;
          sincronizarIndice();
          return;
        }
        trilho.scrollLeft = de + passo * suavizar(t);
        tweenRef.current = requestAnimationFrame(quadro);
      };
      tweenRef.current = requestAnimationFrame(quadro);
    },
    [passoDoCard, sincronizarIndice],
  );

  useEffect(() => {
    if (!trilhoRef.current) return;
    // Quem pediu menos movimento fica só com o arrasto e as setas.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const relogio = window.setInterval(() => {
      if (performance.now() < pausadoAte.current || animando.current) return;
      andar(1);
    }, INTERVALO);

    return () => {
      window.clearInterval(relogio);
      cancelAnimationFrame(tweenRef.current);
      animando.current = false;
    };
  }, [andar]);

  /* O clique também segura o automático, senão o relógio atropela quem está
     navegando na mão. */
  const aoClicarNaSeta = (direcao: number) => () => {
    segurar();
    andar(direcao);
  };

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
    if (!trilho || animando.current) return;
    const set = larguraDoSet();
    if (set <= 0) return;
    if (trilho.scrollLeft >= set) trilho.scrollLeft -= set;
    else if (trilho.scrollLeft <= 0) trilho.scrollLeft += set;
    sincronizarIndice();
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
        Carrossel: anda um card por vez e aceita arrasto.

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
        aria-label="Destinos mais procurados"
        role="group"
      >
        <div className="flex w-max" style={{ gap: GAP }}>
          {loopItems.map((item, i) => (
            <div key={`${item.dest}-${i}`} data-card className="shrink-0">
              <DestinationCard {...item} />
            </div>
          ))}
        </div>
      </div>

      {/*
        Setas e pontos.

        O arrasto sozinho é descoberto: no desktop não há gesto que o anuncie, e
        quem só olha não sabe que a lista continua. As setas dizem que dá para
        andar, e os pontos dizem onde se está.

        Os pontos são decorativos porque o mesmo salto já existe na lista de
        cards, que é navegável por teclado. Um segundo conjunto de dez alvos
        repetiria o percurso sem levar a lugar nenhum de novo.
      */}
      <div className="mt-8 flex items-center justify-center gap-5">
        <button
          type="button"
          onClick={aoClicarNaSeta(-1)}
          aria-label="Destinos anteriores"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-hairline text-ink transition-colors hover:bg-surface-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mp-primary focus-visible:ring-offset-2"
        >
          <CaretLeft className="h-4 w-4" weight="bold" aria-hidden />
        </button>

        <div className="flex items-center gap-1.5" aria-hidden>
          {items.map((item, i) => (
            <span
              key={item.dest}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === indice ? "w-5 bg-ink" : "w-1.5 bg-hairline",
              )}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={aoClicarNaSeta(1)}
          aria-label="Próximos destinos"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-hairline text-ink transition-colors hover:bg-surface-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mp-primary focus-visible:ring-offset-2"
        >
          <CaretRight className="h-4 w-4" weight="bold" aria-hidden />
        </button>
      </div>
    </section>
  );
}
