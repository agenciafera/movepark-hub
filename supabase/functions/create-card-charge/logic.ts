// Lógica pura de create-card-charge (testável sem rede): parsing do payload, itens e extração do card id.

import type { ChargeItem } from "../_shared/payments/types.ts";

/** Reais (numeric) → centavos (inteiro), como o gateway espera. */
export function reaisToCents(amount: number): number {
  return Math.round(Number(amount) * 100);
}

export interface CardInput {
  bookingCode: string;
  /** token single-use (cartão novo) — exclusivo com paymentMethodId. */
  cardToken: string | null;
  /** id do payment_method salvo (cartão reusado) — exclusivo com cardToken. */
  paymentMethodId: string | null;
  installments: number;
  saveCard: boolean;
  /** Dados não-sensíveis do cartão (p/ salvar): brand + last4 + titular + validade. */
  card: {
    holderName: string | null;
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
  };
}

/** Valida o corpo: booking_code, installments>=1, e EXATAMENTE um de card_token | payment_method_id. */
export function parseCardInput(body: unknown): { input: CardInput | null; error?: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const bookingCode = typeof b.booking_code === "string" ? b.booking_code.trim() : "";
  if (!bookingCode) return { input: null, error: "booking_code é obrigatório." };

  const installments =
    typeof b.installments === "number" && Number.isInteger(b.installments) ? b.installments : 0;
  if (installments < 1) return { input: null, error: "installments inválido." };

  const cardToken = typeof b.card_token === "string" && b.card_token.trim() ? b.card_token.trim() : null;
  const paymentMethodId =
    typeof b.payment_method_id === "string" && b.payment_method_id.trim() ? b.payment_method_id.trim() : null;
  if (!cardToken && !paymentMethodId) {
    return { input: null, error: "Informe card_token (cartão novo) ou payment_method_id (salvo)." };
  }
  if (cardToken && paymentMethodId) {
    return { input: null, error: "Use card_token OU payment_method_id, não os dois." };
  }

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

  return {
    input: {
      bookingCode,
      cardToken,
      paymentMethodId,
      installments,
      saveCard: b.save_card === true,
      card: {
        holderName: str(b.holder_name),
        brand: str(b.brand),
        last4: str(b.last4),
        expMonth: num(b.exp_month),
        expYear: num(b.exp_year),
      },
    },
  };
}

/** Itens da order: a reserva (base) + uma linha de juros quando houver. Soma == valor cobrado. */
export function buildCardItems(bookingCode: string, baseCents: number, interestCents: number): ChargeItem[] {
  const items: ChargeItem[] = [{ amount: baseCents, description: `Reserva ${bookingCode}`, quantity: 1 }];
  if (interestCents > 0) {
    items.push({ amount: interestCents, description: "Juros do parcelamento", quantity: 1 });
  }
  return items;
}

/** Extrai o id do cartão (p/ salvar e reusar) da resposta crua do gateway. Defensivo. */
export function extractCardId(raw: unknown): string | null {
  try {
    // deno-lint-ignore no-explicit-any
    const charges = (raw as any)?.charges;
    // deno-lint-ignore no-explicit-any
    const card = Array.isArray(charges) ? charges[0]?.last_transaction?.card : undefined;
    return (card?.id as string) ?? null;
  } catch {
    return null;
  }
}
