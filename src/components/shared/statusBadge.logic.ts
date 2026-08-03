import type { BookingStatus } from "@/types/domain";

/**
 * Tom de cada status da reserva. Mora fora do `StatusBadge.tsx` porque a lista da
 * conta pinta o bloco de data com o mesmo tom, e um arquivo de componente que
 * exporta constante quebra o fast refresh.
 */
export const BOOKING_STATUS_TONES = {
  pending: "pending",
  confirmed: "confirmed",
  checked_in: "active",
  completed: "completed",
  cancelled: "cancelled",
  // Abandono (pending que expirou, nunca pago): tom neutro, não o vermelho de cancelado.
  expired: "neutral",
  // No-show terminou mal, mas não é cancelamento: tom próprio pra não virar a
  // mesma mancha vermelha de "cancelada" numa lista longa.
  no_show: "noshow",
} as const satisfies Record<BookingStatus, string>;

export type BookingTone = (typeof BOOKING_STATUS_TONES)[BookingStatus];

/**
 * Classes de fundo/texto do tom, pra tingir superfícies fora do selo. Se o mapa
 * vivesse só dentro do selo, a linha e o selo poderiam discordar sobre a cor do
 * mesmo status.
 */
export const BOOKING_TONE_SURFACE: Record<BookingTone, string> = {
  confirmed: "bg-badge-confirmed-bg text-badge-confirmed-fg",
  active: "bg-badge-active-bg text-badge-active-fg",
  pending: "bg-badge-pending-bg text-badge-pending-fg",
  completed: "bg-badge-completed-bg text-badge-completed-fg",
  cancelled: "bg-badge-cancelled-bg text-badge-cancelled-fg",
  noshow: "bg-badge-noshow-bg text-badge-noshow-fg",
  neutral: "bg-surface-soft text-muted",
};
