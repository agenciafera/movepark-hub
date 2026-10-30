// Lógica pura da Edge `integration-deliver` (docs/specs/integracoes.md § 5.5). Testável sem rede.

import type { DeliveryResult } from "../_shared/integrations/process.ts";

/** Compara a chave interna do cron em tempo constante. Chave ausente nunca autoriza. */
export function keyMatches(given: string | null, expected: string | null | undefined): boolean {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export type DeliverSummary = Record<DeliveryResult, number> & { released: number };

export function emptySummary(): DeliverSummary {
  return { delivered: 0, retried: 0, failed: 0, cancelled: 0, released: 0 };
}
