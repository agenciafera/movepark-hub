import { useQuery } from "@tanstack/react-query";
import { subDays } from "date-fns";
import { supabase } from "@/lib/supabase";
import {
  bookingParkingAmount,
  buildMoneyBreakdown,
  mainPayment,
  partnerMoneyView,
  type MoneyPaymentLike,
  type PriceBreakdownLike,
} from "@/features/bookings/bookingMoney.logic";

export type ReportPeriod = 7 | 30 | 90;

/**
 * `total` é o que o cliente pagou (com plano). Na visão do estacionamento (08/10/2026) contam
 * `parking` (as diárias) e `net` (o que ele recebe): é a conta que tem que bater com o repasse.
 */
export type DailyRevenueRow = { date: string; total: number; parking: number; net: number; count: number };

type RevenueRow = {
  check_in_at: string;
  total_amount: number | null;
  price_breakdown?: unknown;
  payments?: MoneyPaymentLike[] | null;
};

const REVENUE_SELECT = "check_in_at, total_amount";
// O pagamento completo só na visão do parceiro: é de onde sai o líquido dele (split, taxa, dívida).
const PARTNER_REVENUE_SELECT =
  "check_in_at, total_amount, price_breakdown, payments:payment(status, method, amount, installments, split, split_sent_to_gateway, debt_recovered_cents, gateway_fee_cents, partner_release_at, paid_at, refunded_amount, refund_absorbed_by_master, refund_partner_cents, created_at)";

export function tallyRevenue(rows: RevenueRow[]): DailyRevenueRow[] {
  const map = new Map<string, DailyRevenueRow>();
  for (const row of rows) {
    const key = row.check_in_at.slice(0, 10);
    const current = map.get(key) ?? { date: key, total: 0, parking: 0, net: 0, count: 0 };
    const total = Number(row.total_amount ?? 0);
    const pb = (row.price_breakdown ?? null) as PriceBreakdownLike | null;
    current.total += total;
    current.parking += bookingParkingAmount(pb, total);
    if (row.payments !== undefined) {
      const net = partnerMoneyView(buildMoneyBreakdown(pb, total, mainPayment(row.payments))).netCents;
      current.net += (net ?? 0) / 100;
    }
    current.count += 1;
    map.set(key, current);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function useRevenueByDay(periodDays: ReportPeriod, locationIds?: string[], partner = false) {
  return useQuery({
    queryKey: ["reports", "revenue", periodDays, locationIds, partner],
    queryFn: async (): Promise<DailyRevenueRow[]> => {
      const since = subDays(new Date(), periodDays).toISOString();
      let q = supabase
        .from("booking")
        .select(partner ? PARTNER_REVENUE_SELECT : REVENUE_SELECT)
        .gte("check_in_at", since)
        .in("status", ["confirmed", "checked_in", "completed"]);
      if (locationIds && locationIds.length > 0) q = q.in("location_id", locationIds);
      const { data, error } = await q;
      if (error) throw error;
      return tallyRevenue((data ?? []) as unknown as RevenueRow[]);
    },
  });
}

/**
 * Receita por dia num intervalo livre (o filtro do Manager escolhe o período, não
 * mais uma janela fixa de 7/30/90). `from` inclusivo, `to` exclusivo.
 */
export function useRevenueByRange(fromIso: string, toIso: string, locationIds?: string[], partner = false) {
  return useQuery({
    queryKey: ["reports", "revenue-range", fromIso, toIso, locationIds, partner],
    queryFn: async (): Promise<DailyRevenueRow[]> => {
      let q = supabase
        .from("booking")
        .select(partner ? PARTNER_REVENUE_SELECT : REVENUE_SELECT)
        .gte("check_in_at", fromIso)
        .lt("check_in_at", toIso)
        .in("status", ["confirmed", "checked_in", "completed"]);
      if (locationIds?.length) q = q.in("location_id", locationIds);
      const { data, error } = await q;
      if (error) throw error;
      return tallyRevenue((data ?? []) as unknown as RevenueRow[]);
    },
  });
}

export type StatusFunnelRow = {
  status: string;
  count: number;
};

const FUNNEL_ORDER = [
  "pending",
  "confirmed",
  "checked_in",
  "completed",
  "cancelled",
  "expired",
  "no_show",
];

function tallyStatuses(rows: { status: string }[]): StatusFunnelRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  return FUNNEL_ORDER.filter((s) => counts.has(s)).map((s) => ({
    status: s,
    count: counts.get(s) ?? 0,
  }));
}

export function useStatusFunnel(periodDays: ReportPeriod, locationIds?: string[]) {
  return useQuery({
    queryKey: ["reports", "funnel", periodDays, locationIds],
    queryFn: async (): Promise<StatusFunnelRow[]> => {
      const since = subDays(new Date(), periodDays).toISOString();
      let q = supabase.from("booking").select("status").gte("check_in_at", since);
      if (locationIds && locationIds.length > 0) q = q.in("location_id", locationIds);
      const { data, error } = await q;
      if (error) throw error;
      return tallyStatuses(data ?? []);
    },
  });
}

/** Funil de status num intervalo livre (`from` inclusivo, `to` exclusivo). */
export function useStatusFunnelRange(fromIso: string, toIso: string, locationIds?: string[]) {
  return useQuery({
    queryKey: ["reports", "funnel-range", fromIso, toIso, locationIds],
    queryFn: async (): Promise<StatusFunnelRow[]> => {
      let q = supabase
        .from("booking")
        .select("status")
        .gte("check_in_at", fromIso)
        .lt("check_in_at", toIso);
      if (locationIds?.length) q = q.in("location_id", locationIds);
      const { data, error } = await q;
      if (error) throw error;
      return tallyStatuses(data ?? []);
    },
  });
}
