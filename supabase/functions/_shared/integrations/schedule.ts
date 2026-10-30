// Agenda da fila de integrações (docs/specs/integracoes.md § 5.5). Lógica pura, testável sem rede.

/** Quanto o e-mail de confirmação espera pelo código do provedor (decisão D4 de 30/10/2026). */
export const HOLD_MINUTES = 15;

/** Segundos até a próxima tentativa: 1, 2, 4, 8 e 16 minutos, depois de hora em hora. */
export function nextRetryDelaySeconds(attempt: number): number {
  const n = Math.max(1, attempt);
  if (n <= 5) return 60 * Math.pow(2, n - 1);
  return 3600;
}

/** Com o máximo padrão (28), a última tentativa cai perto de 24 horas depois da primeira. */
export function shouldGiveUp(attempts: number, maxAttempts: number): boolean {
  return attempts >= maxAttempts;
}
