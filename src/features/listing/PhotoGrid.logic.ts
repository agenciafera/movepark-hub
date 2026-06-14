/** Índice circular ao navegar o lightbox (prev/next dão a volta nas pontas). */
export function wrapIndex(current: number, length: number, delta: number): number {
  if (length <= 0) return 0;
  return (current + delta + length) % length;
}
