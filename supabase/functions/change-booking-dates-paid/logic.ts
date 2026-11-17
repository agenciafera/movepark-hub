// Lógica pura de change-booking-dates-paid (testável sem rede): parsing do payload + helpers.
// Ver docs/specs/booking-modifications.md §8.

export interface ChangeDatesPaidInput {
  bookingCode: string;
  checkInAt: string;
  checkOutAt: string;
  /** Só cota: não segura vaga, não cobra, não devolve. É o que a tela mostra antes do botão. */
  dryRun: boolean;
  /**
   * A diferença que a pessoa viu na prévia. Se a cotação mudou até o clique (a tabela de hoje virou,
   * por exemplo), a Edge recusa em vez de cobrar ou devolver um valor que ninguém aprovou.
   */
  expectedDeltaCents: number | null;
}

/** Valida { booking_code, check_in_at, check_out_at, dry_run?, expected_delta_cents? }. */
export function parseChangeDatesPaidInput(
  body: unknown,
): { input: ChangeDatesPaidInput | null; error?: string } {
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
  const expected = b.expected_delta_cents;
  if (expected != null && !(typeof expected === "number" && Number.isInteger(expected))) {
    return { input: null, error: "expected_delta_cents precisa ser inteiro (centavos)." };
  }
  return {
    input: {
      bookingCode: code,
      checkInAt: new Date(inTs).toISOString(),
      checkOutAt: new Date(outTs).toISOString(),
      dryRun: b.dry_run === true,
      expectedDeltaCents: typeof expected === "number" ? expected : null,
    },
  };
}

/** A diferença mudou desde a prévia? Sem prévia (chamada antiga), não confere. */
export function quoteChanged(expectedDeltaCents: number | null, deltaCents: number): boolean {
  return expectedDeltaCents != null && expectedDeltaCents !== deltaCents;
}

/** Quanto ainda dá para devolver desta cobrança (centavos). */
export function refundableCents(amount: number | string | null, refundedAmount: number | string | null): number {
  const total = Math.round(Number(amount ?? 0) * 100);
  const devolvido = Math.round(Number(refundedAmount ?? 0) * 100);
  return Math.max(0, total - devolvido);
}
