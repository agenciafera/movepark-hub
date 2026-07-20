import * as React from "react";

/**
 * Comemoração leve (confete em CSS, sem dependência) para marcar o avanço de fase no onboarding.
 * Toca uma vez ao montar e some. Overlay que não bloqueia clique (pointer-events-none).
 */
const COLORS = ["#5D5FEF", "#DA455E", "#A6DBDF", "#29263F", "#F5A623"];

type Piece = { left: number; delay: number; duration: number; color: string; rotate: number; size: number };

function makePieces(n: number): Piece[] {
  const pieces: Piece[] = [];
  for (let i = 0; i < n; i++) {
    pieces.push({
      left: Math.round(Math.random() * 100),
      delay: Math.round(Math.random() * 250),
      duration: 1100 + Math.round(Math.random() * 900),
      color: COLORS[i % COLORS.length],
      rotate: Math.round(Math.random() * 360),
      size: 6 + Math.round(Math.random() * 6),
    });
  }
  return pieces;
}

/** `loop` mantém o confete caindo pra sempre (festa contínua); sem ele, cai uma vez e some. */
export function ConfettiBurst({ count = 28, loop = false }: { count?: number; loop?: boolean }) {
  // gera as peças uma vez (posição/atraso aleatórios).
  const pieces = React.useMemo(() => makePieces(count), [count]);
  const [gone, setGone] = React.useState(false);
  React.useEffect(() => {
    if (loop) return; // festa contínua não some
    const t = window.setTimeout(() => setGone(true), 2400);
    return () => window.clearTimeout(t);
  }, [loop]);
  if (gone) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{`@keyframes mp-confetti{0%{transform:translateY(-10%) rotate(0);opacity:0}8%{opacity:1}100%{transform:translateY(340px) rotate(320deg);opacity:0}}`}</style>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: 0,
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            borderRadius: 2,
            transform: `rotate(${p.rotate}deg)`,
            animation: `mp-confetti ${p.duration}ms ${p.delay}ms ease-in ${loop ? "infinite" : "forwards"}`,
          }}
        />
      ))}
    </div>
  );
}
