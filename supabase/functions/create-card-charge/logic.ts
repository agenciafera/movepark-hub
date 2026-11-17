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
  /**
   * Diferença de uma troca de datas de reserva PAGA (17/11/2026). Sem isto, é o pagamento da reserva
   * no checkout. Com isto, o valor é a diferença cotada pela tabela da compra, e `expected_delta_cents`
   * é o que o cliente viu na prévia: se mudou, a Edge recusa em vez de cobrar outro valor.
   */
  dateChange: { checkInAt: string; checkOutAt: string; expectedDeltaCents: number } | null;
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

  const dc = parseDateChange(b.date_change);
  if (dc.error) return { input: null, error: dc.error };

  return {
    input: {
      bookingCode,
      cardToken,
      paymentMethodId,
      installments,
      saveCard: b.save_card === true,
      billingAddress: billing.address ?? null,
      dateChange: dc.value,
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

/** O que dizer ao cliente quando o adquirente recusa um dado do cartão que ele digitou. */
export function cardFieldMessage(field: "cvv" | "expiry" | "holder"): string {
  switch (field) {
    case "cvv":
      return "O código de segurança (CVV) não confere. Confira os 3 dígitos no verso do cartão (4 na frente, no Amex).";
    case "expiry":
      return "A validade do cartão não confere. Confira o mês e o ano (MM/AA).";
    case "holder":
      return "Confira o nome impresso no cartão.";
  }
}

/**
 * IP do comprador, para o antifraude da Pagar.me (`ip` no pedido). O navegador chama a Edge
 * direto, então o primeiro IP do encaminhamento é o do cliente. Sem IP o antifraude avalia o
 * pedido às cegas: de 20/10 a 03/11/2026 o banco aprovou e o antifraude reprovou 11 de 13 reservas.
 */
export function clientIp(headers: Headers): string | null {
  const raw = headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0] ?? "";
  const ip = raw.trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip;
  if (/^[0-9a-f:]+$/i.test(ip) && ip.includes(":")) return ip;
  return null;
}

/**
 * Reprovações do antifraude aceitas por reserva antes de parar de mandar o cartão. Cada nova
 * tentativa sobe o score (moderated → high → very_high) e, depois de 20/10/2026, nenhuma
 * retentativa passou. A terceira vai para o PIX sem tocar no gateway.
 */
export const ANTIFRAUD_RETRY_LIMIT = 2;

/** Nota do rastro que marca a reprovação do antifraude (o contador lê por ela). */
export const ANTIFRAUD_NOTE = "reprovado pelo antifraude da Pagar.me (o banco tinha aprovado)";

export const ANTIFRAUD_MESSAGE =
  "A análise de segurança não liberou este cartão agora. Pague com PIX: a confirmação chega na hora.";

/** `date_change` do corpo: datas ISO (saída depois da entrada) e a diferença vista na prévia. */
export function parseDateChange(
  raw: unknown,
): { value: CardInput["dateChange"]; error?: string } {
  if (raw == null) return { value: null };
  if (typeof raw !== "object") return { value: null, error: "date_change inválido." };
  const d = raw as Record<string, unknown>;
  const inTs = Date.parse(typeof d.check_in_at === "string" ? d.check_in_at : "");
  const outTs = Date.parse(typeof d.check_out_at === "string" ? d.check_out_at : "");
  if (Number.isNaN(inTs) || Number.isNaN(outTs)) return { value: null, error: "Datas inválidas (use ISO 8601)." };
  if (outTs <= inTs) return { value: null, error: "Check-out precisa ser após o check-in." };
  const exp = d.expected_delta_cents;
  if (!(typeof exp === "number" && Number.isInteger(exp) && exp > 0)) {
    return { value: null, error: "expected_delta_cents é obrigatório (centavos da diferença a pagar)." };
  }
  return {
    value: { checkInAt: new Date(inTs).toISOString(), checkOutAt: new Date(outTs).toISOString(), expectedDeltaCents: exp },
  };
}

/** Itens da cobrança da diferença de datas: a diferença + a linha de juros, quando houver. */
export function buildDateChangeItems(bookingCode: string, baseCents: number, interestCents: number): ChargeItem[] {
  return buildCardItems(bookingCode, baseCents, interestCents).map((it, i) =>
    i === 0 ? { ...it, description: `Alteração de datas · ${bookingCode}` } : it
  );
}
