// Lógica pura de create-card-charge (testável sem rede): parsing do payload, itens e extração do card id.

import type { BillingAddress, ChargeItem } from "../_shared/payments/types.ts";

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
  /** Obrigatório com card_token (antifraude); cartão salvo já tem o dele no gateway. */
  billingAddress: BillingAddress | null;
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

  const billing = parseBillingAddress(b.billing_address);
  if (cardToken && !billing.address) {
    return { input: null, error: billing.error ?? "Informe o endereço de cobrança do cartão." };
  }

  return {
    input: {
      bookingCode,
      cardToken,
      paymentMethodId,
      installments,
      saveCard: b.save_card === true,
      billingAddress: billing.address ?? null,
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

/**
 * Endereço de cobrança como a Pagar.me pede: CEP com 8 dígitos, line_1 com número e rua, cidade,
 * UF de 2 letras, país BR. Sem endereço devolve `{ address: null }` sem erro: quem decide se é
 * obrigatório é o chamador (só com card_token).
 */
export function parseBillingAddress(v: unknown): { address: BillingAddress | null; error?: string } {
  if (v == null) return { address: null };
  const o = (typeof v === "object" ? v : {}) as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
  const zip = s("zip_code").replace(/\D/g, "");
  if (zip.length !== 8) return { address: null, error: "CEP do endereço de cobrança inválido." };
  const line1 = s("line_1");
  if (line1.length < 2) return { address: null, error: "Endereço de cobrança incompleto (número e rua)." };
  const city = s("city");
  const state = s("state").toUpperCase();
  if (!city || !/^[A-Z]{2}$/.test(state)) return { address: null, error: "Cidade ou UF do endereço de cobrança inválida." };
  const line2 = s("line_2");
  return {
    address: { zip_code: zip, line_1: line1.slice(0, 200), ...(line2 ? { line_2: line2.slice(0, 100) } : {}), city: city.slice(0, 80), state, country: "BR" },
  };
}
