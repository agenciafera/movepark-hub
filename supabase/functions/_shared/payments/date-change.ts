// Troca de datas de reserva paga: contas e passos comuns ao PIX (Edge change-booking-dates-paid) e
// ao cartão (Edge create-card-charge com `date_change`). Ver docs/specs/booking-modifications.md §8.
//
// Regra de 17/11/2026: a diferença sai da tabela da compra (RPC reprice_booking_dates) e é da VAGA.
// Ela divide como a reserva (comissão congelada) e a tarifa nunca entra: nem na cobrança, nem no
// estorno. No estorno, sai do estacionamento a parte dele das diárias devolvidas e da Movepark a
// comissão delas.

import { logGatewayEvent } from "./trail.ts";
import type { PaymentGateway } from "./types.ts";
import { notifyBooking } from "../notify.ts";
import { type DatesChangedMoney, tplBookingDatesChanged } from "../email.ts";
import { siteUrl } from "../site.ts";

/** O que `reprice_booking_dates` devolve (migration 20261204140000). */
export interface DateChangeQuote {
  booking_id: string;
  days: number;
  days_before: number;
  price_source: "compra" | "hoje";
  current_total_cents: number;
  new_total_cents: number | null;
  delta_cents: number | null;
  subtotal_new?: number;
  coupon_discount_new?: number;
  /** Diferença na base do repasse: com cupom da Movepark, o valor cheio da vaga. */
  partner_base_delta_cents?: number;
  available: boolean;
  reason: string | null;
}

/** A cotação como o cliente, o operador e a Mia veem (sem os detalhes do repasse). */
export function quoteView(q: DateChangeQuote) {
  const delta = q.delta_cents ?? 0;
  return {
    available: q.available,
    reason: q.reason,
    days: q.days,
    days_before: q.days_before,
    price_source: q.price_source,
    current_total: q.current_total_cents / 100,
    new_total: q.new_total_cents == null ? null : q.new_total_cents / 100,
    delta: q.delta_cents == null ? null : delta / 100,
    delta_cents: q.delta_cents,
    /** O que acontece com o dinheiro: cobra a diferença, devolve parte ou nada. */
    effect: q.delta_cents == null ? null : delta > 0 ? "charge" : delta < 0 ? "refund" : "none",
  };
}

/**
 * Base da divisão da diferença cobrada. A diferença é toda vaga (a tarifa não muda), então a base do
 * estacionamento é a própria diferença; cupom da Movepark volta para a base dele, como na reserva.
 */
export function chargeSplitBase(q: DateChangeQuote): { chargedCents: number; baseCents: number; platformFundedCents: number } {
  const delta = q.delta_cents ?? 0;
  const partnerBase = q.partner_base_delta_cents ?? delta;
  return { chargedCents: delta, baseCents: delta, platformFundedCents: Math.max(0, partnerBase - delta) };
}

/**
 * Parte do estacionamento nas diárias devolvidas: a mesma conta de `buildSplit` (base menos a
 * comissão, arredondada igual). Ex.: R$ 57,80 com 15% de comissão → R$ 49,13.
 */
export function partnerShareOfRefundCents(partnerBaseCents: number, takeRateBps: number): number {
  const base = Math.abs(Math.round(partnerBaseCents));
  const commission = Math.min(base, Math.max(0, Math.round((base * takeRateBps) / 10000)));
  return base - commission;
}

/** Perna do estacionamento gravada na cobrança (regra nova por `role`, antiga por `liable`). */
export function partnerLegCents(split: unknown): number {
  if (!Array.isArray(split)) return 0;
  return split.reduce((acc: number, r: Record<string, unknown>) => {
    const isPartner = typeof r?.role === "string" ? r.role === "partner" : r?.liable === true;
    return isPartner ? acc + (Number(r.amount) || 0) : acc;
  }, 0);
}

/**
 * Fração acumulada da perna do estacionamento que já voltou ao cliente por troca de datas. O extrato
 * (`payment_partner_refund_ratio`) usa isto no lugar da proporção do total, que incluiria a tarifa.
 */
export function nextPartnerRefundFrac(currentFrac: number, shareCents: number, legCents: number): number {
  if (legCents <= 0) return Math.min(1, Math.max(0, currentFrac || 0));
  return Math.min(1, Math.max(0, (currentFrac || 0) + shareCents / legCents));
}

/**
 * Uma troca de datas viva por reserva: antes de outra (ou de aplicar uma mais barata), anula no
 * gateway os PIX de diferença ainda abertos e solta a vaga que eles seguravam. A ordem importa: se
 * soltasse a vaga antes de anular, o cliente ainda poderia pagar o QR antigo. Best-effort.
 */
export async function cancelPendingDateChanges(
  // deno-lint-ignore no-explicit-any
  admin: any,
  gateway: Pick<PaymentGateway, "refundCharge">,
  bookingId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("payment")
    .select("id, method, provider_charge_id")
    .eq("booking_id", bookingId)
    .eq("kind", "date_change")
    .eq("status", "pending");
  if (error || !data?.length) return 0;
  let n = 0;
  for (const p of data as Array<{ id: string; method: string | null; provider_charge_id: string | null }>) {
    if (p.method === "pix" && p.provider_charge_id) {
      try {
        const r = await gateway.refundCharge({ chargeId: p.provider_charge_id });
        await logGatewayEvent(admin, {
          paymentId: p.id,
          bookingId,
          kind: "refund",
          httpStatus: r.httpStatus,
          request: { reason: "nova troca de datas" },
          response: r.raw,
          note: "PIX de diferença anulado: o cliente escolheu outra troca",
        });
      } catch (e) {
        console.error("[date-change] não consegui anular o PIX aberto:", p.id, e instanceof Error ? e.message : e);
      }
    }
    await admin.rpc("expire_paid_date_change_hold", { p_payment_id: p.id });
    n++;
  }
  return n;
}

function fmtBR(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

/**
 * Avisa o cliente das novas datas (WhatsApp com o benefício, senão e-mail), com o que aconteceu com
 * o dinheiro. Best-effort: nunca lança. O caminho do estorno não mandava aviso nenhum até 17/11/2026.
 */
export async function notifyDatesChanged(
  // deno-lint-ignore no-explicit-any
  admin: any,
  bookingId: string,
  money: DatesChangedMoney | null,
): Promise<void> {
  try {
    const { data: r } = await admin
      .from("booking")
      .select("code, check_in_at, check_out_at, location:location!inner(name, address), vehicle:vehicle(license_plate, model)")
      .eq("id", bookingId)
      .maybeSingle();
    if (!r) return;
    const nd = {
      code: r.code, location_name: r.location?.name ?? "", location_address: r.location?.address ?? null,
      check_in_at: r.check_in_at, check_out_at: r.check_out_at, vehicle: r.vehicle ?? null,
    };
    const quando = `${fmtBR(nd.check_in_at)} a ${fmtBR(nd.check_out_at)}`;
    await notifyBooking(admin, {
      bookingId,
      event: "dates_changed",
      whatsappParams: (c: { name: string | null }) => [c.name ?? "cliente", nd.code, quando],
      email: (c: { name: string | null }) => tplBookingDatesChanged(nd, c.name, `${siteUrl()}/bookings/${nd.code}`, money),
    });
  } catch (e) {
    console.error("[date-change] aviso de novas datas falhou:", bookingId, e instanceof Error ? e.message : e);
  }
}
