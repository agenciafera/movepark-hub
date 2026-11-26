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
  /**
   * Só a equipe da Movepark (hub_admin): troca a reserva Básica sem cobrar o upgrade para Flex. A
   * receita do upgrade é da Movepark, então o parceiro não dispensa (26/11/2026). Exige `reason`.
   */
  waiveFareUpgrade: boolean;
  /** Motivo da dispensa, que vai para o histórico da reserva. */
  reason: string | null;
  /**
   * Estender a saída com o carro no pátio (26/11/2026, parte 2): só a equipe, depois do horário de
   * entrada. A entrada vem igual à da reserva e só a saída muda.
   */
  extend: boolean;
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
  const waive = b.waive_fare_upgrade === true;
  const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 300) : "";
  if (waive && !reason && b.dry_run !== true) {
    return { input: null, error: "Diga o motivo de não cobrar o upgrade." };
  }
  return {
    input: {
      bookingCode: code,
      checkInAt: new Date(inTs).toISOString(),
      checkOutAt: new Date(outTs).toISOString(),
      dryRun: b.dry_run === true,
      expectedDeltaCents: typeof expected === "number" ? expected : null,
      waiveFareUpgrade: waive,
      reason: reason || null,
      extend: b.extend === true,
    },
  };
}

/** Estados em que o carro pode estar no pátio. `completed` entra: o sistema conclui sozinho. */
export const EXTENSION_STATUSES = ["confirmed", "checked_in", "completed"] as const;
/** Até quantos dias depois da saída prevista ainda dá para estender (o alcance da tabela da compra). */
export const EXTENSION_MAX_DAYS_AFTER = 30;

/**
 * Quem e quando estende a saída depois da entrada (decisões D2 e D4 de 26/11/2026). A conta e a
 * vaga são do banco (`reprice_booking_dates` e `hold_paid_date_change` em modo extensão); aqui o
 * que a Edge recusa antes de cotar.
 */
export function extensionDenial(i: {
  isStaff: boolean;
  status: string;
  checkInAt: string;
  checkOutAt: string;
  checkedOutAt: string | null;
  requestedCheckInAt: string;
  requestedCheckOutAt: string;
  now: Date;
}): { status: number; error: string } | null {
  if (!i.isStaff) {
    return { status: 403, error: "Depois da entrada, quem estende a saída é o estacionamento." };
  }
  if (!(EXTENSION_STATUSES as readonly string[]).includes(i.status) || i.checkedOutAt) {
    return { status: 400, error: "Esta reserva não está mais no pátio." };
  }
  if (new Date(i.checkInAt).getTime() > i.now.getTime()) {
    return { status: 400, error: "A reserva ainda não começou. Use Alterar datas." };
  }
  if (new Date(i.requestedCheckInAt).getTime() !== new Date(i.checkInAt).getTime()) {
    return { status: 400, error: "Na extensão, a entrada não muda." };
  }
  const limite = new Date(i.checkOutAt).getTime() + EXTENSION_MAX_DAYS_AFTER * 86_400_000;
  if (limite < i.now.getTime()) {
    return { status: 400, error: `Esta reserva terminou há mais de ${EXTENSION_MAX_DAYS_AFTER} dias.` };
  }
  if (new Date(i.requestedCheckOutAt).getTime() <= new Date(i.checkOutAt).getTime()) {
    return { status: 400, error: "A nova saída precisa ser depois da saída reservada." };
  }
  return null;
}

/** Upgrade que a troca exige: a Básica não inclui alterar datas, então vai para o Flex. */
export interface RequiredFareUpgrade {
  tier: "flex";
  cents: number;
}

/**
 * Regra de 26/11/2026 (decisão D1): quando a EQUIPE da empresa altera as datas de uma reserva cujo
 * plano não inclui `date_change`, cobra o upgrade para o Flex junto. O cliente nunca chega aqui sem
 * o benefício (a Edge recusa antes), e o hub_admin pode dispensar com motivo (D6).
 */
export function fareUpgradeFor(i: {
  isStaff: boolean;
  isHubAdmin: boolean;
  waive: boolean;
  benefits: Record<string, unknown> | null;
  currentFareCents: number | null;
  flexCents: number | null;
}): RequiredFareUpgrade | null {
  if (!i.isStaff) return null;
  if (i.benefits?.date_change === true) return null;
  if (i.waive && i.isHubAdmin) return null;
  if (i.flexCents == null) return null;
  const cents = i.flexCents - (i.currentFareCents ?? 0);
  return cents > 0 ? { tier: "flex", cents } : null;
}

/**
 * Como a troca anda com o upgrade. Diferença positiva: um PIX só com as duas partes. Diferença zero
 * ou negativa: o upgrade vem antes, numa cobrança própria, e a troca depois (a devolução sai pelo
 * caminho de sempre, que só existe na hora, e o PIX único não teria o que dividir com o parceiro).
 */
export function upgradePlan(deltaCents: number, upgrade: RequiredFareUpgrade | null):
  | { kind: "none" }
  | { kind: "together"; chargeCents: number }
  | { kind: "upgrade_first"; upgradeCents: number } {
  if (!upgrade) return { kind: "none" };
  if (deltaCents > 0) return { kind: "together", chargeCents: deltaCents + upgrade.cents };
  return { kind: "upgrade_first", upgradeCents: upgrade.cents };
}

/** Totais da reserva fora da resposta para quem não vê dinheiro (o balcão, sem `finance:read`). */
export function stripTotals<T extends Record<string, unknown>>(view: T, seesMoney: boolean): T {
  if (seesMoney) return view;
  const { current_total: _a, new_total: _b, total_amount: _c, ...rest } = view;
  return { ...rest, current_total: null, new_total: null } as unknown as T;
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
