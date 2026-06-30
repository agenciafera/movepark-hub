// Tarifas de flexibilidade da reserva (E2.8) — Básica / Flex / Superflex.
// Lógica pura e rótulos pt-BR compartilhados pelo seletor do checkout (E2.8-b) e pelo detalhe da
// reserva (E2.8-c). O catálogo (preços/janelas) é a verdade do banco (tabela `fare`, RPC
// `get_unit_fares`); aqui mora só o que é apresentação + cálculo de janela espelhado do SQL.

import type { FareTier } from "@/types/domain";

export type { FareTier };

/** Ordem de exibição (good-better-best). */
export const FARE_TIER_ORDER: FareTier[] = ["basica", "flex", "superflex"];

export const FARE_TIER_LABEL: Record<FareTier, string> = {
  basica: "Básica",
  flex: "Flex",
  superflex: "Superflex",
};

/** Chaves dos benefícios (espelham o jsonb `fare.benefits`). */
export type FareBenefitKey =
  | "free_cancellation"
  | "email_confirmation"
  | "guaranteed_spot"
  | "plate_change"
  | "date_change"
  | "notifications_sms"
  | "flight_delay_protection"
  | "priority_support";

export type FareBenefits = Partial<Record<FareBenefitKey, boolean>>;

/** Rótulo curto de cada benefício, em ordem de exibição na tabela comparativa. */
export const FARE_BENEFIT_LABELS: { key: FareBenefitKey; label: string }[] = [
  { key: "guaranteed_spot", label: "Vaga garantida" },
  { key: "email_confirmation", label: "Confirmação por e-mail" },
  { key: "free_cancellation", label: "Cancelamento grátis" },
  { key: "plate_change", label: "Troca de placa/veículo" },
  { key: "date_change", label: "Alteração de data/horário" },
  { key: "notifications_sms", label: "Avisos por SMS/WhatsApp" },
  { key: "flight_delay_protection", label: "Proteção contra atraso de voo" },
  { key: "priority_support", label: "Suporte prioritário" },
];

/** Item do catálogo retornado por `get_unit_fares`. */
export interface FareOption {
  tier: FareTier;
  label: string;
  price_cents: number;
  is_popular: boolean;
  sort_order: number;
  cancel_window_minutes: number | null;
  benefits: FareBenefits;
}

/** Preço da Tarifa em reais (o catálogo guarda centavos). */
export function fareReais(priceCents: number): number {
  return priceCents / 100;
}

/**
 * Prazo de cancelamento grátis: `cancel_window_minutes` antes do check-in. null = sem janela grátis.
 * Espelha `booking.fare_cancel_until` calculado no `_create_booking_core`.
 */
export function fareCancelDeadline(
  checkInAt: string | Date,
  cancelWindowMinutes: number | null | undefined,
): Date | null {
  if (cancelWindowMinutes === null || cancelWindowMinutes === undefined) return null;
  return new Date(new Date(checkInAt).getTime() - cancelWindowMinutes * 60_000);
}

/** true se ainda dá pra cancelar com reembolso (agora ≤ prazo). Sem janela → sempre false. */
export function isWithinFareCancelWindow(
  checkInAt: string | Date,
  cancelWindowMinutes: number | null | undefined,
  now: Date = new Date(),
): boolean {
  const deadline = fareCancelDeadline(checkInAt, cancelWindowMinutes);
  if (!deadline) return false;
  return now.getTime() <= deadline.getTime();
}

/** Delta (em centavos) de um upgrade de Tarifa. Sem downgrade: alvo mais barato → 0. Base para E2.8-d. */
export function fareUpgradeDeltaCents(currentPriceCents: number, targetPriceCents: number): number {
  return Math.max(0, targetPriceCents - currentPriceCents);
}
