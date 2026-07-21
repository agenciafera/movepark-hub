import * as React from "react";
import { cn } from "@/lib/utils";
import { PALETTES, SPEED, meshBackground, type Palette } from "./HeroMesh.logic";

/**
 * Fundo de hero em mesh gradient animado ("Bloom Field" com a paleta Movepark). Três
 * manchas radiais sobre um fundo sólido, com grão por cima, movidas por
 * `requestAnimationFrame`.
 *
 * Três adaptações ao projeto, além do componente do handoff:
 *
 * 1. **Pinta já no render, não só no efeito.** As páginas são pré-renderizadas
 *    (vite-react-ssg) e `useEffect` não roda no servidor. Sem o quadro inicial no
 *    `style`, o HTML do SSG sairia com o hero sem fundo até a hidratação. O render
 *    usa `ph = 0`, que é exatamente onde a animação começa, então não há salto.
 * 2. **Redução de movimento resolvida aqui dentro.** O handoff manda o consumidor
 *    passar `animated={!reduce}`; deixar isso com quem chama é garantir que uma hora
 *    alguém esquece. Aqui o componente escuta o `matchMedia` e o `animated` vira só
 *    um override.
 * 3. **Nada de `background` shorthand neste elemento.** O handoff avisa: o shorthand
 *    zera o `background-image` que o loop escreve a cada quadro. Quem usa deve pôr
 *    `bg-*` só em filhos, nunca no `className` daqui.
 */
type Props = {
  palette?: Palette;
  /** `false` congela no quadro inicial. Redução de movimento já congela sozinha. */
  animated?: boolean;
  className?: string;
  children?: React.ReactNode;
};

function usePrefersReducedMotion(): boolean {
  // Começa em `false` pra bater com o HTML do SSG e não dar mismatch de hidratação.
  const [reduce, setReduce] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduce(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduce;
}

export function HeroMesh({ palette = "navy", animated = true, className, children }: Props) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduce = usePrefersReducedMotion();
  const move = animated && !reduce;

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!move) {
      el.style.backgroundImage = meshBackground(palette, 0, false);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      el.style.backgroundImage = meshBackground(palette, ((now - start) / 1000) * SPEED, true);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [palette, move]);

  return (
    <div
      ref={ref}
      className={cn("relative isolate overflow-hidden", className)}
      style={{
        backgroundColor: PALETTES[palette].backdrop,
        // Quadro inicial (ph = 0) pro HTML pré-renderizado já sair pintado.
        backgroundImage: meshBackground(palette, 0, false),
        backgroundSize: "120px 120px, auto, auto, auto",
        backgroundBlendMode: "overlay, normal, normal, normal",
      }}
    >
      {children}
    </div>
  );
}
