import { formatInTimeZone } from "date-fns-tz";
import {
  bookingParkingAmount,
  buildMoneyBreakdown,
  mainPayment,
  partnerMoneyView,
  type MoneyPaymentLike,
  type PriceBreakdownLike,
} from "@/features/bookings/bookingMoney.logic";
import type { DailyRevenueRow } from "./api";

/**
 * Receita por dia do pagamento (09/11/2026). A visão por check-in diz quando o carro entra; esta
 * diz quando o dinheiro entrou, que é a conta que bate com o extrato do gateway.
 *
 * O valor de cada reserva é o mesmo da visão por check-in (`total_amount`), só a data muda: assim
 * as duas visões somam a mesma coisa quando o recorte cobre as duas datas. A data é a do
 * pagamento da reserva (`kind = 'booking'`), no fuso de Brasília. Reserva cobrada duas vezes
 * (já aconteceu, MP-07DAE9) conta uma vez só, no primeiro pagamento.
 *
 * `parking` são as diárias: com o detalhe do preço (`price_breakdown`, que só a visão do
 * estacionamento busca) sai o plano da Movepark; sem ele vale o total, como no Manager. Com
 * `net`, soma também o que o estacionamento recebe (a mesma conta da visão por check-in); isso pede
 * o pagamento completo na linha, e quem não precisa do líquido não o busca.
 */
export type PaidDayRow = {
  total_amount: number | string | null;
  price_breakdown?: PriceBreakdownLike | null;
  payments: ({ paid_at: string | null } & Partial<MoneyPaymentLike>)[] | null;
};

export const PAYMENT_TIMEZONE = "America/Sao_Paulo";

export function tallyRevenueByPaidDay(
  rows: PaidDayRow[],
  opts: { net?: boolean } = {},
): DailyRevenueRow[] {
  const map = new Map<string, DailyRevenueRow>();
  for (const row of rows) {
    const paidAt = (row.payments ?? [])
      .map((p) => p.paid_at)
      .filter((d): d is string => !!d)
      .sort()[0];
    if (!paidAt) continue;
    const key = formatInTimeZone(paidAt, PAYMENT_TIMEZONE, "yyyy-MM-dd");
    const total = Number(row.total_amount ?? 0);
    const current = map.get(key) ?? { date: key, total: 0, parking: 0, net: 0, count: 0 };
    current.total += total;
    current.parking += bookingParkingAmount(row.price_breakdown, total);
    if (opts.net) {
      const payment = mainPayment((row.payments ?? []) as MoneyPaymentLike[]);
      const net = partnerMoneyView(
        buildMoneyBreakdown(row.price_breakdown ?? null, total, payment),
      ).netCents;
      current.net += (net ?? 0) / 100;
    }
    current.count += 1;
    map.set(key, current);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}
