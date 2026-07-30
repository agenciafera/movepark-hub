// Lógica pura de create-pix-charge (testável sem rede): conversões e parsing.

import type { ChargeItem } from "../_shared/payments/types.ts";

/** Reais (numeric) → centavos (inteiro), como o gateway espera. */
export function reaisToCents(amount: number): number {
  return Math.round(Number(amount) * 100);
}

/** Item único da reserva (PIX cobra o total numa linha). */
export function buildPixItems(bookingCode: string, totalCents: number): ChargeItem[] {
  return [{ amount: totalCents, description: `Reserva ${bookingCode}`, quantity: 1 }];
}
