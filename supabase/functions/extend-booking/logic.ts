// Lógica pura de extend-booking (testável sem rede): parsing/validação do payload.
// A elegibilidade real (Superflex, status, capacidade) é decidida no servidor pela RPC
// extend_booking_flight_delay — aqui só validamos a forma da requisição.

export interface ExtendInput {
  bookingCode: string;
  newCheckOutAt: string;
  reason: string | null;
}

/** Valida { booking_code, new_check_out_at, reason? }. new_check_out_at tem que ser ISO válido. */
export function parseExtendInput(body: unknown): { input: ExtendInput | null; error?: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const code = typeof b.booking_code === "string" ? b.booking_code.trim() : "";
  if (!code) return { input: null, error: "booking_code é obrigatório." };

  const rawDate = typeof b.new_check_out_at === "string" ? b.new_check_out_at.trim() : "";
  if (!rawDate) return { input: null, error: "new_check_out_at é obrigatório." };
  const ts = Date.parse(rawDate);
  if (Number.isNaN(ts)) return { input: null, error: "new_check_out_at inválido (use ISO 8601)." };

  const reason = typeof b.reason === "string" && b.reason.trim() ? b.reason.trim() : null;
  return { input: { bookingCode: code, newCheckOutAt: new Date(ts).toISOString(), reason } };
}
