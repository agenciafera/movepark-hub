// Lógica pura do webhook do Pagar.me (testável sem rede): auth básica e parsing do evento.

/** Comparação de strings em tempo (quase) constante — evita vazar o segredo por timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  // O XOR do comprimento garante que strings de tamanhos diferentes nunca casem,
  // sem retornar cedo (o loop sempre roda sobre o esperado).
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Verifica o header Basic auth do Pagar.me contra o esperado ("user:pass").
 * - `expectedUserPass` ausente: em staging (`required=false`) aceita; em produção
 *   (`required=true`) **rejeita** (fail-closed — nunca aceitar webhook sem credencial).
 */
export function verifyBasicAuth(
  header: string | null,
  expectedUserPass: string | undefined,
  required = false,
): boolean {
  if (!expectedUserPass) return !required; // sem credencial: aceita só fora de produção
  if (!header) return false;
  const m = header.match(/^Basic\s+(.+)$/i);
  if (!m) return false;
  let expectedB64: string;
  try {
    expectedB64 = btoa(expectedUserPass);
  } catch {
    return false;
  }
  return timingSafeEqual(m[1].trim(), expectedB64);
}

export interface ParsedEvent {
  eventId: string | null;
  type: string;
  orderId: string | null;
  bookingId: string | null;
  bookingCode: string | null;
  rawStatus: string | null;
}

/** Extrai os campos relevantes do payload de webhook (order.* ou charge.*). */
export function parseWebhookEvent(body: unknown): ParsedEvent {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const data = (b.data ?? {}) as Record<string, unknown>;
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  // charge.* → data.order_id; order.* → data.id
  const orderId = (data.order_id as string) ?? (data.id as string) ?? null;
  return {
    eventId: (b.id as string) ?? null,
    type: (b.type as string) ?? "",
    orderId,
    bookingId: (metadata.booking_id as string) ?? null,
    bookingCode: (data.code as string) ?? (metadata.booking_code as string) ?? null,
    rawStatus: (data.status as string) ?? null,
  };
}
