// Lógica pura do webhook do Pagar.me (testável sem rede): auth básica e parsing do evento.

/** Verifica o header Basic auth contra o esperado ("user:pass"). Sem esperado → não exige (staging). */
export function verifyBasicAuth(header: string | null, expectedUserPass: string | undefined): boolean {
  if (!expectedUserPass) return true; // sem credencial configurada → aceita (staging)
  if (!header) return false;
  const m = header.match(/^Basic\s+(.+)$/i);
  if (!m) return false;
  let expectedB64: string;
  try {
    expectedB64 = btoa(expectedUserPass);
  } catch {
    return false;
  }
  // comparação simples (segredo de staging); produção pode usar timing-safe
  return m[1].trim() === expectedB64;
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
