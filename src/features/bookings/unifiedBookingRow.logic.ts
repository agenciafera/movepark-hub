/**
 * Uma linha da lista única de reservas, seja do Hub ou do site white-label, no formato que a
 * tabela desenha (reservas-unificadas-hub-wl.md § 3.2).
 *
 * A regra de "quem não tem white-label não vê nada dele" mora aqui: com `showSource` desligado
 * não sai etiqueta de origem nem o canal "White-label" de uma reserva do Hub.
 */
import { bookingCustomerName } from "./bookings.logic";
import { paymentBadge, type PaymentBadge } from "./payment.logic";
import {
  CHANNEL_ORIGINS,
  channelShortLabel,
  partnerSiteLabel,
  paymentMethodLabel,
} from "./bookingList.logic";
import { bookingParkingAmount, type PriceBreakdownLike } from "./bookingMoney.logic";
import { formatBRL } from "@/lib/format";
import { wlPaymentMethodLabel } from "@/features/wl-bookings/wlBooking.logic";
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
  /** O que o cliente pagou (total da reserva, com taxas e desconto), para o operador conferir na lista. */
  paid: number | null;
  /**
   * Quantas diárias e quanto cada uma (26/11/2026), embaixo do valor das diárias. Só com o snapshot
   * de preço da reserva do Hub e no modo "parking"; o balcão não recebe o snapshot.
   */
  daily: DailyRate | null;
  /** O que leva das diárias ao valor pago: plano e desconto. Nulo quando os dois são iguais. */
  paidNote: string | null;
  status: BookingStatus;
  flightProtection: boolean;
  plate: string | null;
  phone: string | null;
  email: string | null;
};

export type DailyRate = {
  days: number;
  /** Valor de uma diária, arredondado ao centavo. */
  perDay: number;
  /** As diárias fecham o valor na multiplicação. Falso no pacote (15 a 30 dias pelo mesmo preço). */
  exact: boolean;
};

const toCents = (v: unknown) => Math.round((Number(v) || 0) * 100);

/** Diária da reserva pelo snapshot: só a linha da vaga, dividida pelas diárias cobradas. */
export function dailyRate(pb: PriceBreakdownLike | null | undefined): DailyRate | null {
  const days = Number(pb?.days);
  const vaga = (pb?.line_items ?? []).filter((li) => li.kind === "parking");
  if (!Number.isInteger(days) || days < 1 || vaga.length === 0) return null;
  const cents = vaga.reduce((a, li) => a + toCents(li.subtotal), 0);
  const perDayCents = Math.round(cents / days);
  return { days, perDay: perDayCents / 100, exact: perDayCents * days === cents };
}

/** "8 × R$ 18,90"; no pacote, que não fecha na conta, "29 diárias, média de R$ 12,07". */
export function dailyRateLabel(d: DailyRate): string {
  return d.exact
    ? `${d.days} × ${formatBRL(d.perDay)}`
    : `${d.days} diárias, média de ${formatBRL(d.perDay)}`;
}

/**
 * Por que o valor pago difere das diárias: o plano (Flex, Superflex) soma e o cupom tira. Serviço
 * extra já está dentro das diárias (`bookingParkingAmount`), então não entra aqui.
 */
export function paidNote(pb: PriceBreakdownLike | null | undefined, total: number): string | null {
  const itens = pb?.line_items ?? [];
  if (itens.length === 0) return null;
  const partes: string[] = [];
  for (const li of itens) {
    if (li.kind !== "fare" || toCents(li.subtotal) <= 0) continue;
    partes.push(`+ plano ${li.name ?? "da reserva"} ${formatBRL(toCents(li.subtotal) / 100)}`);
  }
  const desconto = itens.reduce((a, li) => a + toCents(li.subtotal), 0) - toCents(total);
  if (desconto > 0) {
    partes.push(`- ${pb?.coupon?.code ? "cupom" : "desconto"} ${formatBRL(desconto / 100)}`);
  }
  return partes.length ? partes.join(" · ") : null;
}

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
      payment: { method: wlPaymentMethodLabel(w.payment_method_name) ?? "No site", badge: null },
      // O site guarda em centavos; o valor é o que o cliente pagou lá (D3).
      value: centavos(w.paid_total_cents ?? w.total_cents),
      paid: centavos(w.paid_total_cents ?? w.total_cents),
      daily: null,
      paidNote: null,
      status: w.status,
      flightProtection: false,
      plate: w.license_plate,
      phone: w.customer_phone,
      email: w.customer_email,
    };
  }

  const b = row.booking;
  const pb = b.price_breakdown as PriceBreakdownLike | null;
  // Diária e nota só onde a tela separa diárias de valor pago, e com o snapshot (o balcão não tem).
  const detalhar = opts.valueMode === "parking" && b.total_amount !== null && b.total_amount !== undefined;
  const veioDoSite = CHANNEL_ORIGINS.white_label.includes(b.origin ?? "");
  return {
    key: `hub:${b.id}`,
    source: "hub",
    sourceLabel: opts.showSource ? "Hub" : null,
    code: b.code,
    createdAt: b.created_at,
    // A venda que chegou pelo site do próprio estacionamento diz isso, e não "Site Movepark".
    channel:
      veioDoSite && !opts.showSource
        ? null
        : (partnerSiteLabel({ ...b, company: b.location?.company ?? null }) ??
          channelShortLabel(b.origin)),
    customer: bookingCustomerName(b),
    companyName: b.location?.company?.name ?? null,
    unitName: b.location?.name ?? null,
    checkIn: b.check_in_at,
    checkOut: b.check_out_at,
    payment: { method: paymentMethodLabel(b.payments), badge: paymentBadge(b.payments, b.status) },
    value:
      opts.valueMode === "parking"
        ? bookingParkingAmount(pb, Number(b.total_amount))
        : Number(b.total_amount),
    status: b.status,
    // O balcão não lê `total_amount` (vem nulo); a lista dele traz só o total pago em `paid_amount`.
    paid:
      b.total_amount !== null && b.total_amount !== undefined
        ? Number(b.total_amount)
        : ((b as { paid_amount?: number | null }).paid_amount ?? null),
    daily: detalhar ? dailyRate(pb) : null,
    paidNote: detalhar ? paidNote(pb, Number(b.total_amount)) : null,
    flightProtection: !!b.fare_extensions?.[0] && !b.fare_extensions[0].actual_check_out_at,
    plate: b.vehicle?.license_plate ?? null,
    phone: b.customer_phone ?? null,
    email: b.customer_email ?? null,
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
