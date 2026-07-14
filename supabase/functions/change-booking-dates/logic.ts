// Lógica pura de change-booking-dates (testável sem rede): parsing/validação do payload + o gate
// de benefício da Tarifa. A VERDADE é o servidor; ver docs/specs/booking-modifications.md.

/**
 * Trocar datas exige o benefício `date_change` da Tarifa (Flex+; Básica não tem). Staff (hub_admin/
 * operador) faz override. `benefits` é o snapshot `booking.fare_benefits`.
 */
export function dateChangeAllowed(
  benefits: Record<string, unknown> | null | undefined,
  isStaff: boolean,
): boolean {
  return isStaff || benefits?.date_change === true;
}

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
