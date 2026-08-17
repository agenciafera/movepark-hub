import type { MarketingLeadRow } from "@/types/domain";

/**
 * O que o cartão do kanban diz sobre o checkout que o originou.
 *
 * O quadro espelha a reserva (gatilho `marketing_sync_lead_from_booking`), então o cartão precisa
 * mostrar em que ponto a pessoa está: checkout aberto com o hold correndo, pagou, ou largou.
 *
 * O relógio é o `expires_at` do hold. É ele que separa "está decidindo agora" de "largou": um hold
 * vencido ainda aparece como `pending` até o cron expirar, e sem essa conta o quadro mostraria uma
 * reserva morta como se fosse oportunidade quente.
 */

export type CheckoutTone = "aberto" | "urgente" | "vencido" | "pago" | "perdido";

export type CheckoutState = {
  label: string;
  tone: CheckoutTone;
  /** Minutos que faltam para o hold vencer. Nulo quando não há hold correndo. */
  minutesLeft: number | null;
};

/** Abaixo disto o hold vira contagem regressiva na cara do operador. */
export const MINUTOS_URGENTE = 10;

export function checkoutState(lead: MarketingLeadRow, agora: Date = new Date()): CheckoutState | null {
  // Lead criado na mão não tem checkout para contar.
  if (!lead.booking_status) return null;

  switch (lead.booking_status) {
    case "confirmed":
    case "checked_in":
    case "completed":
      return { label: "Pagou", tone: "pago", minutesLeft: null };
    case "expired":
      return { label: "Largou o checkout", tone: "perdido", minutesLeft: null };
    case "cancelled":
      return { label: "Cancelou", tone: "perdido", minutesLeft: null };
    case "no_show":
      return { label: "Não apareceu", tone: "perdido", minutesLeft: null };
    case "pending":
      break;
  }

  if (!lead.booking_expires_at) {
    return { label: "Checkout aberto", tone: "aberto", minutesLeft: null };
  }

  const faltam = Math.floor(
    (new Date(lead.booking_expires_at).getTime() - agora.getTime()) / 60_000,
  );

  // Hold vencido que o cron ainda não varreu. Continua `pending` no banco, mas para o time é
  // uma reserva perdida, e mostrar como oportunidade faria alguém correr atrás do que já morreu.
  if (faltam <= 0) return { label: "Hold vencido", tone: "vencido", minutesLeft: 0 };

  if (faltam <= MINUTOS_URGENTE) {
    return { label: `Expira em ${faltam} min`, tone: "urgente", minutesLeft: faltam };
  }

  if (faltam < 60) {
    return { label: `Checkout aberto · ${faltam} min`, tone: "aberto", minutesLeft: faltam };
  }

  const horas = Math.floor(faltam / 60);
  return { label: `Checkout aberto · ${horas}h`, tone: "aberto", minutesLeft: faltam };
}

/** Classes do selo por tom. Uma função só, para o selo não divergir entre kanban e lista. */
export function checkoutToneClasses(tone: CheckoutTone): string {
  switch (tone) {
    case "urgente":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "aberto":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "vencido":
      return "bg-neutral-100 text-neutral-600 border-neutral-200";
    case "pago":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    default:
      return "bg-neutral-100 text-neutral-500 border-neutral-200";
  }
}
