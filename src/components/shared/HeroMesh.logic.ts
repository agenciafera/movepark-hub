/**
 * Paleta e matemática do HeroMesh, fora do componente por dois motivos: o lint de
 * fast refresh pede que arquivo de componente exporte só componente, e a pintura
 * precisa rodar também no render (SSG), não só no efeito.
 *
 * Os números vêm do handoff do design ("Bloom Field" com a paleta Movepark) e são
 * exatos. Duas regras de lá que não podem ser mexidas:
 *
 * - Toda modulação vale **zero** em `ph = 0`, via `sin(x + p) - sin(p)`. É isso que
 *   evita o salto no primeiro quadro do loop.
 * - Nada de arredondar ângulo, centro ou stop por quadro: vira movimento em degraus.
 */

export type Blob = { hex: string; x: number; y: number; reach: number };

/**
 * `ink` é a cor de texto que a paleta pede, segundo o handoff: só a `navy` é fundo
 * escuro e pede branco; `brand` e `aurora` são claras e pedem o navy da marca. Fica
 * aqui pra ninguém pôr texto branco sobre fundo claro por descuido.
 */
export const PALETTES = {
  brand: {
    backdrop: "#E4F2FF",
    ink: "#29263F",
    blobs: [
      { hex: "#5D5FEF", x: 68.1, y: 46.03, reach: 41.1 },
      { hex: "#4041A3", x: 25.17, y: 75.99, reach: 44.6 },
      { hex: "#E4F2FF", x: 53.11, y: 12.71, reach: 66.65 },
    ] as Blob[],
  },
  navy: {
    backdrop: "#29263F",
    ink: "#FFFFFF",
    blobs: [
      { hex: "#5D5FEF", x: 68.1, y: 46.03, reach: 44 },
      { hex: "#4041A3", x: 25.17, y: 75.99, reach: 48 },
      { hex: "#818FAF", x: 53.11, y: 12.71, reach: 60 },
    ] as Blob[],
  },
  aurora: {
    backdrop: "#FFFFFF",
    ink: "#29263F",
    blobs: [
      { hex: "#5D5FEF", x: 68.1, y: 46.03, reach: 42 },
      { hex: "#A6DBDF", x: 25.17, y: 75.99, reach: 46 },
      { hex: "#DA455E", x: 53.11, y: 12.71, reach: 52 },
    ] as Blob[],
  },
} as const;

export type Palette = keyof typeof PALETTES;

/**
 * Grão. A codificação do data-URI é sensível: `%23n` é o `#n` do `filter`, e
 * reencodar isso quebra o parse e o grão some.
 */
export const GRAIN =
  "url(\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.305'/></svg>\")";

/** Fase estática por mancha (hash de seed=1). Nunca animar o hash: vira flicker. */
export const PHASES: [number, number][] = [
  [0.7, 2.1],
  [3.4, 1.2],
  [5.1, 4.6],
];

export const AMT = 0.72;
export const SPEED = 0.86;
/** Amplitude base do sway, em % do container. */
export const SWAY = 14;

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Uma mancha: stops de opacidade 1 → 0.844 → 0.5 → 0.156 → 0 em 0 · R/4 · R/2 · 3R/4 · R. */
export function radial(b: Blob): string {
  const [r, g, bl] = hexToRgb(b.hex);
  const c = (a: number) => `rgba(${r}, ${g}, ${bl}, ${a})`;
  const R = b.reach;
  return (
    `radial-gradient(circle at ${b.x.toFixed(3)}% ${b.y.toFixed(3)}%, ` +
    `${c(1)} 0%, ${c(0.844)} ${(R * 0.25).toFixed(2)}%, ` +
    `${c(0.5)} ${(R * 0.5).toFixed(2)}%, ${c(0.156)} ${(R * 0.75).toFixed(2)}%, ` +
    `${c(0)} ${R.toFixed(2)}%)`
  );
}

/**
 * O `background-image` completo num instante `ph` (relógio já multiplicado por SPEED).
 * `ph = 0` devolve o quadro estático, que é o que o SSG pré-renderiza.
 */
export function meshBackground(palette: Palette, ph: number, animated: boolean): string {
  const layers = PALETTES[palette].blobs.map((blob, i) => {
    const [p, p2] = PHASES[i];
    const dx = animated ? (Math.sin(ph * 0.55 + p) - Math.sin(p)) * SWAY * AMT : 0;
    const dy = animated ? (Math.sin(ph * 0.43 + p2) - Math.sin(p2)) * SWAY * AMT : 0;
    return radial({ ...blob, x: blob.x + dx, y: blob.y + dy });
  });
  return [GRAIN, ...layers].join(", ");
}
