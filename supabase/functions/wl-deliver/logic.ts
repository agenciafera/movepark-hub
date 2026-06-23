// Lógica pura da entrega outbound Hub→WL (E2.5.2) — testável sem rede.

/** Segundos até a próxima tentativa (backoff exponencial a partir de 2min, teto 4h). */
export function nextBackoff(attempts: number): number {
  const base = 120 * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(base, 4 * 3600);
}
