// Lógica pura de change-booking-dates (testável sem rede): parsing/validação do payload.

export interface ChangeDatesInput {
  bookingCode: string;
  checkInAt: string;
  checkOutAt: string;
}

/** Valida { booking_code, check_in_at, check_out_at } (ISO, check_out > check_in). */
export function parseChangeDatesInput(body: unknown): { input: ChangeDatesInput | null; error?: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const code = typeof b.booking_code === "string" ? b.booking_code.trim() : "";
  if (!code) return { input: null, error: "booking_code é obrigatório." };

  const inRaw = typeof b.check_in_at === "string" ? b.check_in_at.trim() : "";
  const outRaw = typeof b.check_out_at === "string" ? b.check_out_at.trim() : "";
  const inTs = Date.parse(inRaw);
  const outTs = Date.parse(outRaw);
  if (Number.isNaN(inTs) || Number.isNaN(outTs)) {
    return { input: null, error: "Datas inválidas (use ISO 8601)." };
  }
  if (outTs <= inTs) return { input: null, error: "Check-out precisa ser após o check-in." };

  return {
    input: {
      bookingCode: code,
      checkInAt: new Date(inTs).toISOString(),
      checkOutAt: new Date(outTs).toISOString(),
    },
  };
}
