/**
 * Uma linha da lista única de reservas, seja do Hub ou do site white-label, no formato que a
 * tabela desenha (reservas-unificadas-hub-wl.md § 3.2).
 *
 * A regra de "quem não tem white-label não vê nada dele" mora aqui: com `showSource` desligado
 * não sai etiqueta de origem nem o canal "White-label" de uma reserva do Hub.
 */
import { bookingCustomerName } from "./bookings.logic";
import { paymentBadge, type PaymentBadge } from "./payment.logic";
import { CHANNEL_ORIGINS, channelShortLabel, paymentMethodLabel } from "./bookingList.logic";
import { bookingParkingAmount, type PriceBreakdownLike } from "./bookingMoney.logic";
import type { BookingStatus, UnifiedBookingRow, WlBookingRow, WlListRow } from "@/types/domain";

export type UnifiedRowView = {
  key: string;
  source: "hub" | "wl";
  /** "Hub" ou "White-label"; null quando a empresa não tem white-label. */
  sourceLabel: string | null;
  code: string;
  createdAt: string | null;
  channel: string | null;
  customer: string | null;
  companyName: string | null;
  unitName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  payment: { method: string | null; badge: PaymentBadge | null };
  value: number | null;
  status: BookingStatus;
  flightProtection: boolean;
};

/** Canal da reserva do site: o legado grava `reserva-online` para a compra feita no próprio site. */
export function wlOriginLabel(origin: string | null | undefined): string | null {
  if (origin === "reserva-online") return "Reserva online";
  return channelShortLabel(origin);
}

function centavos(c: number | null | undefined): number | null {
  return c === null || c === undefined ? null : c / 100;
}

export function unifiedRowView(
  row: UnifiedBookingRow,
  opts: { showSource: boolean; valueMode: "total" | "parking" },
): UnifiedRowView {
  if (row.source === "wl") {
    const w = row.wl;
    return {
      key: `wl:${w.id}`,
      source: "wl",
      sourceLabel: opts.showSource ? "White-label" : null,
      code: w.wl_order_number,
      createdAt: w.wl_created_at,
      channel: wlOriginLabel(w.origin),
      customer: w.customer_name,
      companyName: w.company_name,
      unitName: w.location_name ?? w.parking_type_name,
      checkIn: w.check_in_at,
      checkOut: w.check_out_at,
      // Forma de pagamento do site quando a cópia já trouxe; senão, só que foi pago lá.
      payment: { method: w.payment_method_name ?? "No site", badge: null },
      // O site guarda em centavos; o valor é o que o cliente pagou lá (D3).
      value: centavos(w.paid_total_cents ?? w.total_cents),
      status: w.status,
      flightProtection: false,
    };
  }

  const b = row.booking;
  const veioDoSite = CHANNEL_ORIGINS.white_label.includes(b.origin ?? "");
  return {
    key: `hub:${b.id}`,
    source: "hub",
    sourceLabel: opts.showSource ? "Hub" : null,
    code: b.code,
    createdAt: b.created_at,
    channel: veioDoSite && !opts.showSource ? null : channelShortLabel(b.origin),
    customer: bookingCustomerName(b),
    companyName: b.location?.company?.name ?? null,
    unitName: b.location?.name ?? null,
    checkIn: b.check_in_at,
    checkOut: b.check_out_at,
    payment: { method: paymentMethodLabel(b.payments), badge: paymentBadge(b.payments, b.status) },
    value:
      opts.valueMode === "parking"
        ? bookingParkingAmount(b.price_breakdown as PriceBreakdownLike | null, Number(b.total_amount))
        : Number(b.total_amount),
    status: b.status,
    flightProtection: !!b.fare_extensions?.[0] && !b.fare_extensions[0].actual_check_out_at,
  };
}

/** Filtro de origem da lista. Só aparece para quem tem white-label. */
export type SourceFilter = "all" | "hub" | "wl";

export const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "hub", label: "Hub" },
  { value: "wl", label: "White-label" },
];

/**
 * A linha da lista única vem com o status no vocabulário do Hub; o detalhe e as ações falam o do
 * site (`site_status`), que é o que o site aceita mudar.
 */
export function wlListRowToBooking(w: WlListRow): WlBookingRow {
  return { ...w, status: w.site_status };
}
