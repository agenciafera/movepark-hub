import { useQuery } from "@tanstack/react-query";
import { subDays } from "date-fns";
import { supabase } from "@/lib/supabase";

export type ReportPeriod = 7 | 30 | 90;

export type DailyRevenueRow = { date: string; total: number; count: number };

export function useRevenueByDay(periodDays: ReportPeriod, locationIds?: string[]) {
  return useQuery({
    queryKey: ["reports", "revenue", periodDays, locationIds],
    queryFn: async (): Promise<DailyRevenueRow[]> => {
      const since = subDays(new Date(), periodDays).toISOString();
      let q = supabase
        .from("booking")
        .select("check_in_at, total_amount")
        .gte("check_in_at", since)
        .in("status", ["confirmed", "checked_in", "completed"]);
      if (locationIds && locationIds.length > 0) q = q.in("location_id", locationIds);
      const { data, error } = await q;
      if (error) throw error;
      const map = new Map<string, DailyRevenueRow>();
      for (const row of data ?? []) {
        const key = (row.check_in_at as string).slice(0, 10);
        const current = map.get(key) ?? { date: key, total: 0, count: 0 };
        current.total += Number(row.total_amount ?? 0);
        current.count += 1;
        map.set(key, current);
      }
      return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    },
  });
}

/**
 * Receita por dia num intervalo livre (o filtro do Manager escolhe o período, não
 * mais uma janela fixa de 7/30/90). `from` inclusivo, `to` exclusivo.
 */
export function useRevenueByRange(fromIso: string, toIso: string, locationIds?: string[]) {
  return useQuery({
    queryKey: ["reports", "revenue-range", fromIso, toIso, locationIds],
    queryFn: async (): Promise<DailyRevenueRow[]> => {
      let q = supabase
        .from("booking")
        .select("check_in_at, total_amount")
        .gte("check_in_at", fromIso)
        .lt("check_in_at", toIso)
        .in("status", ["confirmed", "checked_in", "completed"]);
      if (locationIds?.length) q = q.in("location_id", locationIds);
      const { data, error } = await q;
      if (error) throw error;
      const map = new Map<string, DailyRevenueRow>();
      for (const row of data ?? []) {
        const key = (row.check_in_at as string).slice(0, 10);
        const current = map.get(key) ?? { date: key, total: 0, count: 0 };
        current.total += Number(row.total_amount ?? 0);
        current.count += 1;
        map.set(key, current);
      }
      return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
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
