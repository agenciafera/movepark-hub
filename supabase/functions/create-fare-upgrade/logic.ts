// Lógica pura de create-fare-upgrade (testável sem rede): parsing/validação do payload + helpers.

const TIERS = ["basica", "flex", "superflex"] as const;
export type FareTier = (typeof TIERS)[number];

export interface UpgradeInput {
  bookingCode: string;
  targetTier: FareTier;
}

/** Valida { booking_code, target_tier }. */
export function parseUpgradeInput(body: unknown): { input: UpgradeInput | null; error?: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const code = typeof b.booking_code === "string" ? b.booking_code.trim() : "";
  if (!code) return { input: null, error: "booking_code é obrigatório." };
  const target = typeof b.target_tier === "string" ? b.target_tier.trim() : "";
  if (!(TIERS as readonly string[]).includes(target)) {
    return { input: null, error: "target_tier inválido." };
  }
  return { input: { bookingCode: code, targetTier: target as FareTier } };
}

/** Recusa do upgrade: status HTTP + mensagem devolvida ao cliente. */
export interface UpgradeDenial {
  status: number;
  error: string;
}

/** Statuses de reserva que aceitam upgrade. `pending` entra: dá para comprar upgrade antes de pagar. */
export const UPGRADABLE_BOOKING_STATUSES = ["pending", "confirmed"] as const;

export interface UpgradableBooking {
  status: string;
  check_in_at: string;
  fare_tier: string | null;
  profile_id: string;
}

/**
 * Gates de negócio sobre a reserva, na ordem em que a Edge aplica.
 *
 * `booking` nulo cobre reserva inexistente. A checagem de dono é explícita porque a leitura roda no
 * client de serviço, sem RLS: sem ela, qualquer usuário logado compraria upgrade da reserva alheia.
 */
export function checkBookingUpgradable(input: {
  booking: UpgradableBooking | null;
  userId: string;
  targetTier: FareTier;
  now: Date;
}): UpgradeDenial | null {
  const { booking, userId, targetTier, now } = input;
  if (!booking) return { status: 404, error: "Reserva não encontrada" };
  if (booking.profile_id !== userId) return { status: 403, error: "Reserva não pertence a você" };
  if (!(UPGRADABLE_BOOKING_STATUSES as readonly string[]).includes(booking.status)) {
    return { status: 400, error: "Esta reserva não permite upgrade." };
  }
  if (new Date(booking.check_in_at) <= now) {
    return { status: 400, error: "Upgrade só antes da entrada." };
  }
  if (booking.fare_tier === targetTier) {
    return { status: 400, error: "A reserva já está nessa Tarifa." };
  }
  return null;
}

/**
 * Gate do preço: só cobra quando a Tarifa-alvo é mais cara que a atual. Delta zero ou negativo é
 * downgrade, e não existe downgrade pago. A RPC `apply_fare_upgrade` repete a checagem como segunda
 * barreira (vira noop idempotente).
 */
export function checkUpgradeDelta(input: {
  targetPriceCents: number | null;
  currentFarePriceCents: number | null;
}): UpgradeDenial | null {
  if (input.targetPriceCents == null) return { status: 404, error: "Tarifa-alvo indisponível." };
  const delta = input.targetPriceCents - (input.currentFarePriceCents ?? 0);
  if (delta <= 0) return { status: 400, error: "Sem upgrade (Tarifa-alvo não é superior)." };
  return null;
}

/** Reais (numeric) → centavos (inteiro). */
export function reaisToCents(amount: number): number {
  return Math.round(Number(amount) * 100);
}

/** Telefone BR → { ddd, number } ou null. */
export function parseBrPhone(value: string | null | undefined): { ddd: string; number: string } | null {
  let digits = (value ?? "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  if (digits.length < 10) return null;
  return { ddd: digits.slice(0, 2), number: digits.slice(2, 13) };
}
