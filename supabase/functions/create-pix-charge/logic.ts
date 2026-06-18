// Lógica pura de create-pix-charge (testável sem rede): conversões e parsing.

import type { ChargeItem } from "../_shared/payments/types.ts";

/** Reais (numeric) → centavos (inteiro), como o gateway espera. */
export function reaisToCents(amount: number): number {
  return Math.round(Number(amount) * 100);
}

/** Telefone (E.164 ou mascarado) → { ddd, number } ou null. */
export function parseBrPhone(value: string | null | undefined): { ddd: string; number: string } | null {
  let digits = (value ?? "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  if (digits.length < 10) return null;
  return { ddd: digits.slice(0, 2), number: digits.slice(2, 13) };
}

/** Item único da reserva (PIX cobra o total numa linha). */
export function buildPixItems(bookingCode: string, totalCents: number): ChargeItem[] {
  return [{ amount: totalCents, description: `Reserva ${bookingCode}`, quantity: 1 }];
}
