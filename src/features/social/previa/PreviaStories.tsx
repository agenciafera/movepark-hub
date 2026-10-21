import * as React from "react";
import { ArrowCounterClockwise, Heart, PaperPlaneTilt, X } from "@phosphor-icons/react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import {
  AVATAR,
  FONTE_DO_INSTAGRAM,
  type PostDaPrevia,
  STORY_INICIAL,
  STORY_MS,
  STORY_TICK_MS,
  type StoryAcao,
  type StoryEstado,
  storyReducer,
  USUARIO,
} from "./previa.logic";

/** Um toque que dura mais que isso é "segurar", e não "tocar": não muda de story ao soltar. */
const TOQUE_LONGO_MS = 250;

/**
 * O post como o Instagram mostra um post repostado nos stories: 9:16, barrinhas de progresso, o
 * slide inteiro sobre a mesma imagem ampliada e desfocada. Avança sozinho a cada `STORY_MS`, o
 * toque na metade direita avança e na esquerda volta, segurar pausa, e o último fica na tela até
 * "Rever". Com movimento reduzido não anda sozinho. Só visual; stories não são publicados pela
 * fila. Spec: docs/specs/instagram-fila-de-publicacao.md
 */
export function PreviaStories({ post }: { post: Pick<PostDaPrevia, "id" | "slides"> }) {
  const total = post.slides.length;
  const reduzido = usePrefersReducedMotion();
  const [estado, despachar] = React.useReducer(
    (e: StoryEstado, a: StoryAcao) => storyReducer(e, a, total),
    STORY_INICIAL,
  );
  const [pausado, setPausado] = React.useState(false);
  const inicioDoToque = React.useRef(0);
  const toqueLongo = React.useRef(false);

  React.useEffect(() => {
    if (reduzido || pausado || estado.terminou) return;
    const relogio = setInterval(() => despachar({ tipo: "tick" }), STORY_TICK_MS);
    return () => clearInterval(relogio);
  }, [reduzido, pausado, estado.terminou]);

  function segurar() {
    toqueLongo.current = false;
    inicioDoToque.current = Date.now();
    setPausado(true);
  }

  function soltar() {
    if (inicioDoToque.current) {
      toqueLongo.current = Date.now() - inicioDoToque.current > TOQUE_LONGO_MS;
      inicioDoToque.current = 0;
    }
    setPausado(false);
  }

  function tocar(tipo: "proximo" | "anterior") {
    // Quem segurou para pausar e soltou não queria mudar de story.
    if (toqueLongo.current) {
      toqueLongo.current = false;
      return;
    }
    despachar({ tipo });
  }

  const slide = post.slides[estado.indice];

  return (
    <div className="space-y-3">
      <div
        data-testid="story-tela"
        style={{ fontFamily: FONTE_DO_INSTAGRAM }}
        onPointerDown={segurar}
        onPointerUp={soltar}
        onPointerLeave={soltar}
        onPointerCancel={soltar}
        className="relative mx-auto aspect-[9/16] w-[300px] max-w-full select-none overflow-hidden rounded-xl bg-black text-white"
      >
        {slide && (
          <>
            <img
              data-testid="story-fundo"
              src={slide.url}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 size-full scale-125 object-cover blur-2xl brightness-50"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <img
                src={slide.url}
                alt={slide.alt ?? ""}
                className="aspect-[4/5] w-full object-contain"
              />
            </div>
          </>
        )}

        <button
          type="button"
          aria-label="Story anterior"
          onClick={() => tocar("anterior")}
          className="absolute inset-y-0 left-0 z-10 w-1/2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
        />
        <button
          type="button"
          aria-label="Próximo story"
          onClick={() => tocar("proximo")}
          className="absolute inset-y-0 right-0 z-10 w-1/2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 space-y-2 bg-gradient-to-b from-black/60 to-transparent p-3 pb-6">
          <div aria-hidden="true" className="flex gap-1">
            {post.slides.map((s, i) => {
              const largura =
                i < estado.indice
                  ? 100
                  : i > estado.indice
                    ? 0
                    : reduzido
                      ? 100
                      : Math.min(100, (estado.decorrido * 100) / STORY_MS);
              return (
                <div key={s.path} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/35">
                  <div
                    data-testid={`story-barra-${i}`}
                    className="h-full bg-white transition-[width] duration-[50ms] ease-linear motion-reduce:transition-none"
                    style={{ width: `${largura}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <img
              data-testid="story-avatar"
              src={AVATAR}
              alt=""
              className="size-8 rounded-full object-cover"
            />
            <span className="text-sm font-semibold">{USUARIO}</span>
            <span className="text-sm text-white/70">agora</span>
            <X aria-hidden="true" size={22} className="ml-auto" />
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center gap-3 bg-gradient-to-t from-black/60 to-transparent p-3 pt-6">
          <div className="flex-1 rounded-full border border-white/80 px-4 py-2.5 text-sm text-white/90">
            Enviar mensagem
          </div>
          <Heart aria-hidden="true" size={26} />
          <PaperPlaneTilt aria-hidden="true" size={26} />
        </div>

        {estado.terminou && (
          <button
            type="button"
            onClick={() => despachar({ tipo: "reiniciar" })}
            className="absolute left-1/2 top-1/2 z-30 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm font-semibold text-white hover:bg-black/80"
          >
            <ArrowCounterClockwise aria-hidden="true" size={18} weight="bold" />
            Rever
          </button>
        )}
      </div>

      <p className="text-center text-xs text-muted">
        Simulação: stories não são publicados pela fila.
      </p>
    </div>
  );
}
